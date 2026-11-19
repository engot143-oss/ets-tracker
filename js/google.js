(function (global) {
  const SPREADSHEET_NAME = "ETS Data";
  const SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ].join(" ");
  const ID_KEY = "ets-spreadsheet-id";
  const SNAPSHOT_KEY = "ets-last-remote-hash";

  const INV_HEADERS = [
    "id",
    "slot",
    "catalogNumber",
    "name",
    "description",
    "quantity",
    "status",
  ];
  const MISS_HEADERS = [
    "id",
    "name",
    "catalogNumber",
    "quantity",
    "quoteNumber",
    "poNumber",
    "vendor",
    "date",
    "notes",
    "status",
    "description",
  ];

  let tokenClient = null;
  let accessToken = null;
  let tokenExpiresAt = 0;
  let spreadsheetId = localStorage.getItem(ID_KEY) || "";
  let saveTimer = null;
  let saveInFlight = false;
  let saveAgain = false;
  let configured = false;
  let signedIn = false;
  let hooks = {
    onStatus: function () {},
    onData: function () {},
    getData: function () {
      return { inventory: [], missing: [] };
    },
    isDirty: function () {
      return false;
    },
    markClean: function () {},
  };

  function clientId() {
    const cfg = global.ETS_CONFIG || {};
    return (cfg.googleClientId || "").trim();
  }

  function isConfigured() {
    const id = clientId();
    if (!id || !id.includes(".apps.googleusercontent.com")) return false;
    if (/^YOUR_|PASTE_|REPLACE_|EXAMPLE_/i.test(id)) return false;
    return true;
  }

  function setStatus(state, detail) {
    hooks.onStatus({
      state: state,
      signedIn: signedIn,
      configured: configured,
      detail: detail || "",
    });
  }

  function hashData(data) {
    return JSON.stringify({
      inventory: data.inventory || [],
      missing: data.missing || [],
    });
  }

  function api(url, options) {
    const opts = options || {};
    const headers = Object.assign(
      {
        Authorization: "Bearer " + accessToken,
      },
      opts.headers || {}
    );
    return fetch(url, Object.assign({}, opts, { headers })).then(function (res) {
      if (res.status === 401) {
        const err = new Error("auth");
        err.code = 401;
        throw err;
      }
      if (!res.ok) {
        return res.text().then(function (text) {
          throw new Error("Google request failed (" + res.status + "): " + text.slice(0, 180));
        });
      }
      if (res.status === 204) return {};
      return res.json();
    });
  }

  function requestToken(prompt) {
    return new Promise(function (resolve, reject) {
      if (!tokenClient) {
        reject(new Error("Google sign-in is not ready."));
        return;
      }
      tokenClient.callback = function (resp) {
        if (resp && resp.error) {
          reject(new Error(resp.error));
          return;
        }
        accessToken = resp.access_token;
        const seconds = Number(resp.expires_in || 3600);
        tokenExpiresAt = Date.now() + Math.max(60, seconds - 60) * 1000;
        signedIn = true;
        resolve(resp);
      };
      tokenClient.requestAccessToken({ prompt: prompt || "" });
    });
  }

  function ensureToken() {
    if (accessToken && Date.now() < tokenExpiresAt) {
      return Promise.resolve();
    }
    return requestToken("");
  }

  function withAuth(fn) {
    return ensureToken()
      .then(fn)
      .catch(function (err) {
        if (err && err.code === 401) {
          accessToken = null;
          return requestToken("").then(fn);
        }
        throw err;
      });
  }

  function findSpreadsheet() {
    const q = encodeURIComponent(
      "name = '" +
        SPREADSHEET_NAME +
        "' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false"
    );
    return api(
      "https://www.googleapis.com/drive/v3/files?spaces=drive&fields=files(id,name,modifiedTime)&q=" +
        q
    ).then(function (body) {
      const files = (body.files || []).slice().sort(function (a, b) {
        return String(b.modifiedTime).localeCompare(String(a.modifiedTime));
      });
      return files[0] || null;
    });
  }

  function createSpreadsheet() {
    return api("https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        properties: { title: SPREADSHEET_NAME },
        sheets: [
          { properties: { title: "Inventory" } },
          { properties: { title: "Missing" } },
        ],
      }),
    }).then(function (body) {
      return body.spreadsheetId;
    });
  }

  function ensureTabs() {
    return api(
      "https://sheets.googleapis.com/v4/spreadsheets/" +
        spreadsheetId +
        "?fields=sheets.properties.title"
    ).then(function (body) {
      const titles = (body.sheets || []).map(function (sheet) {
        return sheet.properties && sheet.properties.title;
      });
      const requests = [];
      if (titles.indexOf("Inventory") === -1) {
        requests.push({ addSheet: { properties: { title: "Inventory" } } });
      }
      if (titles.indexOf("Missing") === -1) {
        requests.push({ addSheet: { properties: { title: "Missing" } } });
      }
      if (!requests.length) return;
      return api(
        "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + ":batchUpdate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requests: requests }),
        }
      );
    });
  }

  function rowToInv(row) {
    const obj = {};
    INV_HEADERS.forEach(function (key, i) {
      obj[key] = row[i] || "";
    });
    obj.quantity = Number(obj.quantity || 0);
    return obj;
  }

  function rowToMiss(row) {
    const obj = {};
    MISS_HEADERS.forEach(function (key, i) {
      obj[key] = row[i] || "";
    });
    obj.quantity = Number(obj.quantity || 0);
    return obj;
  }

  function readSheets() {
    const url =
      "https://sheets.googleapis.com/v4/spreadsheets/" +
      spreadsheetId +
      "/values:batchGet?ranges=" +
      encodeURIComponent("Inventory") +
      "&ranges=" +
      encodeURIComponent("Missing");
    return api(url).then(function (body) {
      const ranges = body.valueRanges || [];
      const invRows = (ranges[0] && ranges[0].values) || [];
      const missRows = (ranges[1] && ranges[1].values) || [];
      const inventory = invRows.slice(1).filter(function (row) {
        return row && row.join("").trim();
      }).map(rowToInv);
      const missing = missRows.slice(1).filter(function (row) {
        return row && row.join("").trim();
      }).map(rowToMiss);
      return { inventory: inventory, missing: missing };
    });
  }

  function invToRow(item) {
    return INV_HEADERS.map(function (key) {
      return item[key] == null ? "" : String(item[key]);
    });
  }

  function missToRow(item) {
    return MISS_HEADERS.map(function (key) {
      return item[key] == null ? "" : String(item[key]);
    });
  }

  function forgetSpreadsheet() {
    spreadsheetId = "";
    localStorage.removeItem(ID_KEY);
  }

  function isMissingFile(err) {
    const msg = String(err && err.message ? err.message : err);
    return /failed \(404\)/.test(msg) || /not found/i.test(msg);
  }

  function writeSheets(data) {
    const invValues = [INV_HEADERS].concat((data.inventory || []).map(invToRow));
    const missValues = [MISS_HEADERS].concat((data.missing || []).map(missToRow));
    return api(
      "https://sheets.googleapis.com/v4/spreadsheets/" + spreadsheetId + "/values:batchClear",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ranges: ["Inventory!A1:Z1000", "Missing!A1:Z1000"],
        }),
      }
    ).then(function () {
      return api(
        "https://sheets.googleapis.com/v4/spreadsheets/" +
          spreadsheetId +
          "/values:batchUpdate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            valueInputOption: "RAW",
            data: [
              { range: "Inventory!A1", values: invValues },
              { range: "Missing!A1", values: missValues },
            ],
          }),
        }
      );
    });
  }

  function rememberSnapshot(data) {
    localStorage.setItem(SNAPSHOT_KEY, hashData(data));
  }

  function lastSnapshot() {
    return localStorage.getItem(SNAPSHOT_KEY) || "";
  }

  function connectAndLoad() {
    return withAuth(function () {
      const findOrCreate = spreadsheetId
        ? Promise.resolve({ id: spreadsheetId })
        : findSpreadsheet().then(function (file) {
            if (file) return file;
            return createSpreadsheet().then(function (id) {
              return { id: id };
            });
          });
      return findOrCreate.then(function (file) {
        spreadsheetId = file.id;
        localStorage.setItem(ID_KEY, spreadsheetId);
        return ensureTabs()
          .then(readSheets)
          .catch(function (err) {
            if (!isMissingFile(err)) throw err;
            forgetSpreadsheet();
            return findSpreadsheet().then(function (found) {
              if (found) return found;
              return createSpreadsheet().then(function (id) {
                return { id: id };
              });
            }).then(function (created) {
              spreadsheetId = created.id;
              localStorage.setItem(ID_KEY, spreadsheetId);
              return ensureTabs().then(readSheets);
            });
          })
          .then(function (remote) {
            const local = hooks.getData();
            const remoteEmpty = !remote.inventory.length && !remote.missing.length;
            const localHas =
              (local.inventory && local.inventory.length) ||
              (local.missing && local.missing.length);
            const localHash = hashData(local);
            const remoteHash = hashData(remote);
            const snap = lastSnapshot();
            const unsyncedLocal =
              localHas &&
              localHash !== remoteHash &&
              (hooks.isDirty() || (snap && localHash !== snap));
            if (unsyncedLocal || (remoteEmpty && localHas)) {
              return writeSheets(local).then(function () {
                rememberSnapshot(local);
                hooks.markClean();
                return local;
              });
            }
            rememberSnapshot(remote);
            hooks.markClean();
            hooks.onData(remote);
            return remote;
          });
      });
    });
  }

  function flushSave() {
    if (!signedIn || !configured) return Promise.resolve();
    if (!navigator.onLine) {
      setStatus("offline", "Changes are saved on this device.");
      return Promise.resolve();
    }
    if (saveInFlight) {
      saveAgain = true;
      return Promise.resolve();
    }
    saveInFlight = true;
    setStatus("saving", "Saving to Google Sheet…");
    const data = hooks.getData();
    return withAuth(function () {
      if (!spreadsheetId) {
        return findSpreadsheet().then(function (file) {
          if (file) {
            spreadsheetId = file.id;
            localStorage.setItem(ID_KEY, spreadsheetId);
            return ensureTabs().then(function () {
              return writeSheets(data);
            });
          }
          return createSpreadsheet().then(function (id) {
            spreadsheetId = id;
            localStorage.setItem(ID_KEY, id);
            return writeSheets(data);
          });
        });
      }
      return writeSheets(data);
    })
      .catch(function (err) {
        if (!isMissingFile(err)) throw err;
        forgetSpreadsheet();
        return withAuth(function () {
          return findSpreadsheet().then(function (file) {
            if (file) {
              spreadsheetId = file.id;
              localStorage.setItem(ID_KEY, spreadsheetId);
              return ensureTabs().then(function () {
                return writeSheets(data);
              });
            }
            return createSpreadsheet().then(function (id) {
              spreadsheetId = id;
              localStorage.setItem(ID_KEY, id);
              return writeSheets(data);
            });
          });
        });
      })
      .then(function () {
        rememberSnapshot(data);
        hooks.markClean();
        setStatus("saved", "Saved to Google Sheet");
      })
      .catch(function (err) {
        setStatus("error", err.message || "Could not save to Google.");
      })
      .then(function () {
        saveInFlight = false;
        if (saveAgain) {
          saveAgain = false;
          return flushSave();
        }
      });
  }

  function scheduleSave() {
    if (!signedIn || !configured) return;
    setStatus("saving", "Saving to Google Sheet…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      flushSave();
    }, 900);
  }

  function init(options) {
    hooks = Object.assign(hooks, options || {});
    configured = isConfigured();
    window.addEventListener("online", function () {
      if (signedIn) scheduleSave();
      else if (!configured) setStatus("offline", "Not signed in");
    });
    window.addEventListener("offline", function () {
      setStatus("offline", "Offline. Changes stay on this device.");
    });
    if (!configured) {
      setStatus("offline", "");
      return;
    }
    if (!navigator.onLine) {
      setStatus("offline", "Offline. Changes stay on this device.");
      return;
    }
    setStatus("offline", "");
  }

  function gisReady() {
    return !!(global.google && google.accounts && google.accounts.oauth2);
  }

  function waitForGis(timeoutMs) {
    if (gisReady()) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      const start = Date.now();
      const timer = setInterval(function () {
        if (gisReady()) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(timer);
          reject(new Error("Google sign-in script did not load."));
        }
      }, 100);
    });
  }

  function signIn() {
    if (!configured) {
      setStatus("error", "Add your Google Client ID in config.js first.");
      return Promise.resolve();
    }
    setStatus("saving", "Waiting for Google…");
    return waitForGis(8000)
      .then(function () {
        tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId(),
          scope: SCOPES,
          callback: function () {},
        });
        return requestToken("consent");
      })
      .then(connectAndLoad)
      .then(function () {
        setStatus("saved", "Signed in. Sheet is connected.");
      })
      .catch(function (err) {
        signedIn = !!accessToken;
        setStatus("error", err.message || "Google sign-in failed.");
      });
  }

  function signOut() {
    signedIn = false;
    if (accessToken && gisReady() && google.accounts.oauth2.revoke) {
      google.accounts.oauth2.revoke(accessToken, function () {});
    }
    accessToken = null;
    tokenExpiresAt = 0;
    setStatus("offline", "Not signed in");
  }

  global.ETSGoogle = {
    isConfigured: isConfigured,
    init: init,
    signIn: signIn,
    signOut: signOut,
    scheduleSave: scheduleSave,
    flushSave: flushSave,
  };
})(window);
