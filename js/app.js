(function () {
  const SLOT_STATUSES = ["available", "in use", "in sterilization", "needs repair"];
  const MISSING_FLOW = [
    "Need quote",
    "Waiting for quote",
    "Submitted (PO)",
    "Waiting delivery",
    "Received",
  ];
  const DONUT_COLORS = {
    "Need quote": "#c4923a",
    "Waiting for quote": "#3d6e8c",
    "Submitted (PO)": "#4f7a57",
    "Waiting delivery": "#b85a32",
    Received: "#2f6b45",
  };

  const SAMPLE_INVENTORY = [
    inv("Scissors 1", "EX-MAYO-014", "Mayo scissors", "6.75 in. straight Mayo scissors for heavy tissue and suture.", 8, "available"),
    inv("Scissors 2", "EX-MAYO-014", "Mayo scissors", "6.75 in. straight Mayo scissors for heavy tissue and suture.", 6, "available"),
    inv("Scissors 3", "EX-METZ-018", "Metzenbaum scissors", "7 in. curved Metzenbaum scissors for delicate dissection.", 5, "in sterilization"),
    inv("Scissors 4", "EX-METZ-018", "Metzenbaum scissors", "7 in. curved Metzenbaum scissors for delicate dissection.", 12, "available"),
    inv("Forcep 1", "EX-ADS-012", "Adson forceps", "4.75 in. Adson forceps, 1×2 teeth, for skin and fascia.", 10, "available"),
    inv("Forcep 2", "EX-ADS-012", "Adson forceps", "4.75 in. Adson forceps, 1×2 teeth, for skin and fascia.", 4, "needs repair"),
    inv("Forcep 3", "EX-DEB-024", "DeBakey forceps", "7.75 in. atraumatic DeBakey forceps for vascular tissue.", 6, "available"),
    inv("Forcep 4", "EX-DEB-024", "DeBakey forceps", "7.75 in. atraumatic DeBakey forceps for vascular tissue.", 5, "in sterilization"),
  ];

  const SAMPLE_MISSING = [
    miss("Weitlaner retractor", "EX-WEIT-014", "4 in. self-retaining Weitlaner, blunt prongs.", 2, "", "", "Example Surgical Supply Co.", daysAgo(7), "Needed to complete Minor Tray B rebuild.", "Need quote"),
    miss("Mayo-Hegar needle holder", "EX-NH-MH-006", "6 in. Mayo-Hegar needle holder.", 1, "EX-Q-8831", "", "Example Integra Demo", daysAgo(9), "Vendor said a quote is due this week.", "Waiting for quote"),
    miss("DeBakey forceps", "EX-DEB-024", "Replacement for a worn atraumatic pair.", 1, "EX-Q-8740", "EX-PO-4412", "Example Surgical Supply Co.", daysAgo(11), "PO submitted after quote approval.", "Submitted (PO)"),
    miss("Metzenbaum scissors", "EX-METZ-018", "7 in. curved pair after a count short.", 2, "EX-Q-8602", "EX-PO-4388", "Example Medline Sample", daysAgo(15), "Carrier estimate: next week.", "Waiting delivery"),
    miss("Adson forceps", "EX-ADS-012", "4.75 in. 1×2 teeth pair received and put into stock.", 1, "EX-Q-8519", "EX-PO-4301", "Example Surgical Supply Co.", daysAgo(22), "Received and added to inventory as Forcep 2.", "Received"),
  ];

  const state = {
    tab: "inventory",
    inventory: [],
    missing: [],
    availableOnly: false,
    editingInvId: null,
    editingMissId: null,
    dirty: false,
    invMessage: "",
    missMessage: "",
    invError: false,
    missError: false,
  };

  const els = {};

  function uid(prefix) {
    return (
      prefix +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.floor(Math.random() * 10000).toString(36)
    );
  }

  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function inv(slot, catalogNumber, name, description, quantity, status) {
    return {
      id: uid("s"),
      slot: slot,
      catalogNumber: catalogNumber,
      name: name,
      description: description,
      quantity: quantity,
      status: status,
    };
  }

  function miss(name, catalogNumber, description, quantity, quoteNumber, poNumber, vendor, date, notes, status) {
    return {
      id: uid("m"),
      name: name,
      catalogNumber: catalogNumber,
      description: description,
      quantity: quantity,
      quoteNumber: quoteNumber,
      poNumber: poNumber,
      vendor: vendor,
      date: date,
      notes: notes,
      status: status,
    };
  }

  function parseQty(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  function suggestedSlot(name, items) {
    const prefix = /scissor/i.test(name)
      ? "Scissors"
      : /forcep/i.test(name)
        ? "Forcep"
        : (name.split(/\s+/)[0] || "Item");
    const nums = items
      .filter(function (row) {
        return row.slot.toLowerCase().startsWith(prefix.toLowerCase() + " ");
      })
      .map(function (row) {
        return Number(row.slot.slice(prefix.length + 1));
      })
      .filter(function (n) {
        return Number.isFinite(n);
      });
    const max = nums.length ? Math.max.apply(null, nums) : 0;
    return prefix + " " + (max + 1);
  }

  function findCatalogMatch(catalogNumber, skipInvId, skipMissId) {
    const key = (catalogNumber || "").trim().toLowerCase();
    if (!key) return null;
    const fromInv = state.inventory.find(function (row) {
      return row.catalogNumber.toLowerCase() === key && row.id !== skipInvId;
    });
    if (fromInv) {
      return { name: fromInv.name, description: fromInv.description };
    }
    const fromMiss = state.missing.find(function (row) {
      return row.catalogNumber.toLowerCase() === key && row.id !== skipMissId;
    });
    if (fromMiss) {
      return { name: fromMiss.name, description: fromMiss.description };
    }
    return null;
  }

  function persist() {
    const saved = ETSStorage.save({
      inventory: state.inventory,
      missing: state.missing,
      updatedAt: new Date().toISOString(),
    });
    state.dirty = true;
    ETSGoogle.scheduleSave();
    return saved;
  }

  function applyData(data, asClean) {
    state.inventory = (data && data.inventory) || [];
    state.missing = (data && data.missing) || [];
    if (asClean) state.dirty = false;
    render();
  }

  function statusClass(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function nextMissingStatus(status) {
    const i = MISSING_FLOW.indexOf(status);
    if (i < 0 || i >= MISSING_FLOW.length - 1) return null;
    return MISSING_FLOW[i + 1];
  }

  function prevMissingStatus(status) {
    const i = MISSING_FLOW.indexOf(status);
    if (i <= 0) return null;
    return MISSING_FLOW[i - 1];
  }

  function promptValue(title, message, label) {
    return new Promise(function (resolve) {
      els.promptTitle.textContent = title;
      els.promptMessage.textContent = message;
      els.promptInput.value = "";
      els.promptInput.placeholder = label || "";
      function done(ok) {
        els.promptDialog.removeEventListener("close", onClose);
        resolve(ok ? els.promptInput.value.trim() : null);
      }
      function onClose() {
        done(els.promptDialog.returnValue === "ok");
      }
      els.promptDialog.addEventListener("close", onClose);
      els.promptDialog.returnValue = "cancel";
      els.promptDialog.showModal();
      els.promptInput.focus();
    });
  }

  function setInvMessage(text, isError) {
    state.invMessage = text;
    state.invError = !!isError;
    els.invMessage.textContent = text;
    els.invMessage.classList.toggle("error", !!isError);
  }

  function setMissMessage(text, isError) {
    state.missMessage = text;
    state.missError = !!isError;
    els.missMessage.textContent = text;
    els.missMessage.classList.toggle("error", !!isError);
  }

  function emptyInvForm() {
    return {
      slot: "",
      catalogNumber: "",
      name: "",
      description: "",
      quantity: "1",
      status: "available",
    };
  }

  function emptyMissForm() {
    return {
      name: "",
      description: "",
      catalogNumber: "",
      quantity: "1",
      quoteNumber: "",
      poNumber: "",
      vendor: "",
      date: today(),
      notes: "",
      status: "Need quote",
    };
  }

  function fillInvForm(data) {
    els.invSlot.value = data.slot || "";
    els.invCatalog.value = data.catalogNumber || "";
    els.invName.value = data.name || "";
    els.invDesc.value = data.description || "";
    els.invQty.value = data.quantity == null ? "1" : String(data.quantity);
    els.invStatus.value = data.status || "available";
    els.invSubmit.textContent = state.editingInvId ? "Save slot" : "Add slot";
    if (els.invFormTitle) {
      els.invFormTitle.textContent = state.editingInvId ? "Edit slot" : "Add a slot";
    }
  }

  function fillMissForm(data) {
    els.missName.value = data.name || "";
    els.missDesc.value = data.description || "";
    els.missCatalog.value = data.catalogNumber || "";
    els.missQty.value = data.quantity == null ? "1" : String(data.quantity);
    els.missQuote.value = data.quoteNumber || "";
    els.missPo.value = data.poNumber || "";
    els.missVendor.value = data.vendor || "";
    els.missDate.value = data.date || today();
    els.missNotes.value = data.notes || "";
    els.missStatus.value = data.status || "Need quote";
    els.missSubmit.textContent = state.editingMissId ? "Save entry" : "Add to missing list";
    if (els.missFormTitle) {
      els.missFormTitle.textContent = state.editingMissId
        ? "Edit missing instrument"
        : "Add a missing instrument";
    }
  }

  function onInvCatalogInput() {
    const match = findCatalogMatch(els.invCatalog.value, state.editingInvId, null);
    if (!match) return;
    els.invName.value = match.name;
    els.invDesc.value = match.description;
    if (!els.invSlot.value.trim()) {
      els.invSlot.placeholder = suggestedSlot(match.name, state.inventory);
    }
  }

  function onMissCatalogInput() {
    const match = findCatalogMatch(els.missCatalog.value, null, state.editingMissId);
    if (!match) return;
    els.missName.value = match.name;
    els.missDesc.value = match.description;
  }

  function saveInventory(event) {
    event.preventDefault();
    const catalogNumber = els.invCatalog.value.trim();
    const name = els.invName.value.trim();
    const description = els.invDesc.value.trim();
    const slotName = els.invSlot.value.trim() || (name ? suggestedSlot(name, state.inventory) : "");
    const quantity = parseQty(els.invQty.value);
    const status = els.invStatus.value;
    if (!catalogNumber) {
      setInvMessage("Type a catalog number.", true);
      return;
    }
    if (!name) {
      setInvMessage("Enter a name, or type a catalog number that is already used.", true);
      return;
    }
    if (!slotName) {
      setInvMessage("Enter a slot name such as Scissors 1 or Forcep 3.", true);
      return;
    }
    const duplicate = state.inventory.some(function (row) {
      return row.slot.toLowerCase() === slotName.toLowerCase() && row.id !== state.editingInvId;
    });
    if (duplicate) {
      setInvMessage("A slot named " + slotName + " already exists.", true);
      return;
    }
    if (state.editingInvId) {
      state.inventory = state.inventory.map(function (row) {
        if (row.id !== state.editingInvId) return row;
        return {
          id: row.id,
          slot: slotName,
          catalogNumber: catalogNumber,
          name: name,
          description: description,
          quantity: quantity,
          status: status,
        };
      });
      setInvMessage("Updated " + slotName + ".");
    } else {
      state.inventory.push({
        id: uid("s"),
        slot: slotName,
        catalogNumber: catalogNumber,
        name: name,
        description: description,
        quantity: quantity,
        status: status,
      });
      setInvMessage("Added " + slotName + ".");
    }
    state.editingInvId = null;
    persist();
    fillInvForm(emptyInvForm());
    renderInventoryTable();
  }

  function startEditInv(id) {
    const row = state.inventory.find(function (item) {
      return item.id === id;
    });
    if (!row) return;
    state.editingInvId = id;
    fillInvForm(row);
    setInvMessage("Editing " + row.slot + ".");
    els.invForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function deleteInv(id) {
    const row = state.inventory.find(function (item) {
      return item.id === id;
    });
    if (!row) return;
    if (!confirm("Delete slot " + row.slot + "?")) return;
    state.inventory = state.inventory.filter(function (item) {
      return item.id !== id;
    });
    if (state.editingInvId === id) {
      state.editingInvId = null;
      fillInvForm(emptyInvForm());
    }
    persist();
    setInvMessage("Deleted " + row.slot + ".");
    renderInventoryTable();
  }

  function saveMissing(event) {
    event.preventDefault();
    const name = els.missName.value.trim();
    const catalogNumber = els.missCatalog.value.trim();
    if (!name || !catalogNumber) {
      setMissMessage("Instrument name and catalog number are required.", true);
      return;
    }
    const next = {
      id: state.editingMissId || uid("m"),
      name: name,
      description: els.missDesc.value.trim(),
      catalogNumber: catalogNumber,
      quantity: Math.max(1, parseQty(els.missQty.value)),
      quoteNumber: els.missQuote.value.trim(),
      poNumber: els.missPo.value.trim(),
      vendor: els.missVendor.value.trim(),
      date: els.missDate.value.trim() || today(),
      notes: els.missNotes.value.trim(),
      status: els.missStatus.value,
    };
    if (state.editingMissId) {
      state.missing = state.missing.map(function (item) {
        return item.id === next.id ? next : item;
      });
      setMissMessage("Updated " + name + ".");
    } else {
      state.missing.unshift(next);
      setMissMessage("Added " + name + " as " + next.status + ".");
    }
    state.editingMissId = null;
    persist();
    fillMissForm(emptyMissForm());
    renderMissing();
  }

  function startEditMiss(id) {
    const row = state.missing.find(function (item) {
      return item.id === id;
    });
    if (!row) return;
    state.editingMissId = id;
    fillMissForm(row);
    setMissMessage("Editing " + row.name + ".");
    els.missForm.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function deleteMiss(id) {
    const row = state.missing.find(function (item) {
      return item.id === id;
    });
    if (!row) return;
    if (!confirm("Delete missing entry for " + row.name + "?")) return;
    state.missing = state.missing.filter(function (item) {
      return item.id !== id;
    });
    if (state.editingMissId === id) {
      state.editingMissId = null;
      fillMissForm(emptyMissForm());
    }
    persist();
    setMissMessage("Deleted " + row.name + ".");
    renderMissing();
  }

  async function advanceMissing(id) {
    const item = state.missing.find(function (row) {
      return row.id === id;
    });
    if (!item) return;
    const next = nextMissingStatus(item.status);
    if (!next) return;
    const patch = { status: next };
    if (next === "Waiting for quote" && !item.quoteNumber) {
      const value = await promptValue(
        "Quote number",
        "Enter the quote # for " + item.name + " before marking Waiting for quote.",
        "Quote #"
      );
      if (value == null) return;
      if (!value) {
        setMissMessage("A quote number is needed to advance.", true);
        return;
      }
      patch.quoteNumber = value;
    }
    if (next === "Submitted (PO)" && !item.poNumber) {
      const value = await promptValue(
        "PO number",
        "Enter the PO # for " + item.name + " before marking Submitted (PO).",
        "PO #"
      );
      if (value == null) return;
      if (!value) {
        setMissMessage("A PO number is needed to advance.", true);
        return;
      }
      patch.poNumber = value;
    }
    state.missing = state.missing.map(function (row) {
      if (row.id !== id) return row;
      return Object.assign({}, row, patch);
    });
    persist();
    setMissMessage("Moved " + item.name + " to " + next + ".");
    renderMissing();
  }

  function backMissing(id) {
    const item = state.missing.find(function (row) {
      return row.id === id;
    });
    if (!item) return;
    const prev = prevMissingStatus(item.status);
    if (!prev) return;
    state.missing = state.missing.map(function (row) {
      if (row.id !== id) return row;
      return Object.assign({}, row, { status: prev });
    });
    persist();
    setMissMessage("Moved " + item.name + " back to " + prev + ".");
    renderMissing();
  }

  function visibleInventory() {
    if (!state.availableOnly) return state.inventory;
    return state.inventory.filter(function (row) {
      return row.status === "available";
    });
  }

  function missingCounts() {
    const map = {};
    MISSING_FLOW.forEach(function (status) {
      map[status] = 0;
    });
    state.missing.forEach(function (item) {
      map[item.status] = (map[item.status] || 0) + 1;
    });
    return map;
  }

  function polar(cx, cy, r, angle) {
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  }

  function renderDonut() {
    const counts = missingCounts();
    const total = state.missing.length;
    const cx = 74;
    const cy = 74;
    const r = 54;
    const inner = 32;
    let angle = -Math.PI / 2;
    const parts = [];
    if (!total) {
      parts.push(
        '<circle cx="74" cy="74" r="54" fill="#efe8dc"></circle>' +
          '<circle cx="74" cy="74" r="32" fill="#fffcf7"></circle>'
      );
    } else {
      MISSING_FLOW.forEach(function (status) {
        const value = counts[status];
        if (!value) return;
        const slice = (value / total) * Math.PI * 2;
        const start = angle;
        const end = angle + slice;
        angle = end;
        const large = slice > Math.PI ? 1 : 0;
        const p1 = polar(cx, cy, r, start);
        const p2 = polar(cx, cy, r, end);
        const p3 = polar(cx, cy, inner, end);
        const p4 = polar(cx, cy, inner, start);
        const d = [
          "M", p1.x, p1.y,
          "A", r, r, 0, large, 1, p2.x, p2.y,
          "L", p3.x, p3.y,
          "A", inner, inner, 0, large, 0, p4.x, p4.y,
          "Z",
        ].join(" ");
        parts.push('<path d="' + d + '" fill="' + DONUT_COLORS[status] + '"></path>');
      });
    }
    parts.push(
      '<text x="74" y="70" text-anchor="middle" font-size="18" font-weight="700" fill="#241f1a">' +
        total +
        "</text>" +
        '<text x="74" y="88" text-anchor="middle" font-size="11" fill="#5e574e">entries</text>'
    );
    els.donut.innerHTML = parts.join("");
    els.legend.innerHTML = "";
    MISSING_FLOW.forEach(function (status) {
      const li = document.createElement("li");
      const left = document.createElement("span");
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = DONUT_COLORS[status];
      left.appendChild(swatch);
      left.appendChild(document.createTextNode(status));
      const right = document.createElement("strong");
      right.textContent = String(counts[status]);
      li.appendChild(left);
      li.appendChild(right);
      els.legend.appendChild(li);
    });
  }

  function td(label, text) {
    const cell = document.createElement("td");
    cell.setAttribute("data-label", label);
    cell.textContent = text;
    return cell;
  }

  function renderInventoryTable() {
    const rows = visibleInventory();
    els.invEmpty.classList.toggle("hidden", rows.length > 0);
    els.invEmpty.textContent = state.availableOnly
      ? "No available slots. Turn off Status = Available to see the rest."
      : "No slots yet. Add one above, or load sample data.";
    els.invBody.innerHTML = "";
    rows.forEach(function (row) {
      const tr = document.createElement("tr");
      tr.appendChild(td("Slot", row.slot));
      tr.appendChild(td("Catalog #", row.catalogNumber));
      tr.appendChild(td("Name", row.name));
      tr.appendChild(td("Description", row.description));
      tr.appendChild(td("Quantity", String(row.quantity)));
      const statusCell = document.createElement("td");
      statusCell.setAttribute("data-label", "Status");
      const pill = document.createElement("span");
      pill.className = "status " + statusClass(row.status);
      pill.textContent = row.status;
      statusCell.appendChild(pill);
      tr.appendChild(statusCell);
      const actions = document.createElement("td");
      actions.setAttribute("data-label", "Actions");
      const wrap = document.createElement("div");
      wrap.className = "row-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "quiet";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () {
        startEditInv(row.id);
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () {
        deleteInv(row.id);
      });
      wrap.appendChild(editBtn);
      wrap.appendChild(delBtn);
      actions.appendChild(wrap);
      tr.appendChild(actions);
      els.invBody.appendChild(tr);
    });
  }

  function renderMissingList() {
    els.missList.innerHTML = "";
    if (!state.missing.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No missing-instrument entries yet.";
      els.missList.appendChild(empty);
      return;
    }
    state.missing.forEach(function (item) {
      const card = document.createElement("article");
      card.className = "missing-card";
      const title = document.createElement("h3");
      title.textContent = item.name;
      const meta = document.createElement("div");
      meta.className = "meta";
      [
        ["Catalog #", item.catalogNumber],
        ["Qty ordered", String(item.quantity)],
        ["Quote #", item.quoteNumber || "—"],
        ["PO #", item.poNumber || "—"],
        ["Vendor", item.vendor || "—"],
        ["Date", item.date || "—"],
        ["Notes", item.notes || "—"],
      ].forEach(function (pair) {
        const line = document.createElement("div");
        line.textContent = pair[0] + ": " + pair[1];
        meta.appendChild(line);
      });
      const actions = document.createElement("div");
      actions.className = "row-actions";
      actions.style.marginTop = "10px";
      const statusBtn = document.createElement("button");
      statusBtn.type = "button";
      statusBtn.className = "status-btn status " + statusClass(item.status);
      const nxt = nextMissingStatus(item.status);
      statusBtn.textContent = item.status;
      statusBtn.title = nxt ? "Advance to " + nxt : "Received";
      statusBtn.disabled = !nxt;
      statusBtn.addEventListener("click", function () {
        advanceMissing(item.id);
      });
      const backBtn = document.createElement("button");
      backBtn.type = "button";
      backBtn.className = "quiet";
      backBtn.textContent = "Back";
      backBtn.disabled = !prevMissingStatus(item.status);
      backBtn.addEventListener("click", function () {
        backMissing(item.id);
      });
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "quiet";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () {
        startEditMiss(item.id);
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () {
        deleteMiss(item.id);
      });
      actions.appendChild(statusBtn);
      actions.appendChild(backBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(actions);
      els.missList.appendChild(card);
    });
  }

  function renderMissing() {
    renderDonut();
    renderMissingList();
    els.missCount.textContent = String(
      state.missing.filter(function (item) {
        return item.status !== "Received";
      }).length
    );
  }

  function renderTabs() {
    els.tabInventory.setAttribute("aria-selected", String(state.tab === "inventory"));
    els.tabMissing.setAttribute("aria-selected", String(state.tab === "missing"));
    els.inventoryPanel.classList.toggle("hidden", state.tab !== "inventory");
    els.missingPanel.classList.toggle("hidden", state.tab !== "missing");
  }

  function renderSync(info) {
    const stateName = info.state || "offline";
    let label = "Not signed in";
    if (stateName === "saved") label = "Saved";
    else if (stateName === "saving") label = "Saving";
    else if (stateName === "error") label = "Error";
    else if (stateName === "offline") {
      label = navigator.onLine ? (info.signedIn ? "Offline" : "Not signed in") : "Offline";
    }
    els.syncPill.dataset.state = stateName === "offline" && !info.signedIn ? "offline" : stateName;
    els.syncPill.textContent = label;
    els.syncPill.title = info.detail || "";
    const showDetail = stateName === "error" || stateName === "saving" || stateName === "saved" || (stateName === "offline" && info.signedIn);
    els.syncDetail.textContent = showDetail ? (info.detail || "") : "";
    const showGoogle = ETSGoogle.isConfigured();
    els.signInBtn.classList.toggle("hidden", !showGoogle || info.signedIn);
    els.signOutBtn.classList.toggle("hidden", !info.signedIn);
  }

  function render() {
    renderTabs();
    renderInventoryTable();
    renderMissing();
  }

  function loadSample() {
    if (state.inventory.length || state.missing.length) {
      if (!confirm("Replace current data with sample rows?")) return;
    }
    state.inventory = SAMPLE_INVENTORY.map(function (row) {
      return Object.assign({}, row, { id: uid("s") });
    });
    state.missing = SAMPLE_MISSING.map(function (row) {
      return Object.assign({}, row, { id: uid("m") });
    });
    persist();
    setInvMessage("Sample data loaded.");
    setMissMessage("Sample data loaded.");
    render();
  }

  function importFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = ETSStorage.importJSON(String(reader.result || ""));
        applyData(data, false);
        persist();
        setInvMessage("Imported JSON.");
        setMissMessage("Imported JSON.");
      } catch (err) {
        setInvMessage(err.message || "Could not import that file.", true);
      }
    };
    reader.readAsText(file);
  }

  function cacheEls() {
    els.tabInventory = document.getElementById("tab-inventory");
    els.tabMissing = document.getElementById("tab-missing");
    els.inventoryPanel = document.getElementById("inventory-panel");
    els.missingPanel = document.getElementById("missing-panel");
    els.invForm = document.getElementById("inv-form");
    els.invFormTitle = document.getElementById("inv-form-title");
    els.invSlot = document.getElementById("inv-slot");
    els.invCatalog = document.getElementById("inv-catalog");
    els.invName = document.getElementById("inv-name");
    els.invDesc = document.getElementById("inv-desc");
    els.invQty = document.getElementById("inv-qty");
    els.invStatus = document.getElementById("inv-status");
    els.invSubmit = document.getElementById("inv-submit");
    els.invClear = document.getElementById("inv-clear");
    els.invMessage = document.getElementById("inv-message");
    els.availableOnly = document.getElementById("available-only");
    els.invBody = document.getElementById("inv-body");
    els.invEmpty = document.getElementById("inv-empty");
    els.missForm = document.getElementById("miss-form");
    els.missFormTitle = document.getElementById("miss-form-title");
    els.missName = document.getElementById("miss-name");
    els.missDesc = document.getElementById("miss-desc");
    els.missCatalog = document.getElementById("miss-catalog");
    els.missQty = document.getElementById("miss-qty");
    els.missQuote = document.getElementById("miss-quote");
    els.missPo = document.getElementById("miss-po");
    els.missVendor = document.getElementById("miss-vendor");
    els.missDate = document.getElementById("miss-date");
    els.missNotes = document.getElementById("miss-notes");
    els.missStatus = document.getElementById("miss-status");
    els.missSubmit = document.getElementById("miss-submit");
    els.missClear = document.getElementById("miss-clear");
    els.missMessage = document.getElementById("miss-message");
    els.missList = document.getElementById("miss-list");
    els.missCount = document.getElementById("miss-count");
    els.donut = document.getElementById("donut");
    els.legend = document.getElementById("legend");
    els.syncPill = document.getElementById("sync-pill");
    els.syncDetail = document.getElementById("sync-detail");
    els.signInBtn = document.getElementById("sign-in");
    els.signOutBtn = document.getElementById("sign-out");
    els.loadSample = document.getElementById("load-sample");
    els.exportJson = document.getElementById("export-json");
    els.exportCsv = document.getElementById("export-csv");
    els.importJson = document.getElementById("import-json");
    els.importFile = document.getElementById("import-file");
    els.promptDialog = document.getElementById("prompt-dialog");
    els.promptTitle = document.getElementById("prompt-title");
    els.promptMessage = document.getElementById("prompt-message");
    els.promptInput = document.getElementById("prompt-input");
  }

  function bind() {
    els.tabInventory.addEventListener("click", function () {
      state.tab = "inventory";
      renderTabs();
    });
    els.tabMissing.addEventListener("click", function () {
      state.tab = "missing";
      renderTabs();
    });
    els.invForm.addEventListener("submit", saveInventory);
    els.invCatalog.addEventListener("input", onInvCatalogInput);
    els.invClear.addEventListener("click", function () {
      state.editingInvId = null;
      fillInvForm(emptyInvForm());
      setInvMessage("");
    });
    els.availableOnly.addEventListener("change", function () {
      state.availableOnly = els.availableOnly.checked;
      renderInventoryTable();
    });
    els.missForm.addEventListener("submit", saveMissing);
    els.missCatalog.addEventListener("input", onMissCatalogInput);
    els.missClear.addEventListener("click", function () {
      state.editingMissId = null;
      fillMissForm(emptyMissForm());
      setMissMessage("");
    });
    els.loadSample.addEventListener("click", loadSample);
    els.exportJson.addEventListener("click", function () {
      ETSStorage.exportJSON({
        inventory: state.inventory,
        missing: state.missing,
        updatedAt: new Date().toISOString(),
      });
    });
    els.exportCsv.addEventListener("click", function () {
      ETSStorage.exportCSV({
        inventory: state.inventory,
        missing: state.missing,
      });
    });
    els.importJson.addEventListener("click", function () {
      els.importFile.click();
    });
    els.importFile.addEventListener("change", function () {
      const file = els.importFile.files && els.importFile.files[0];
      els.importFile.value = "";
      if (file) importFile(file);
    });
    els.signInBtn.addEventListener("click", function () {
      ETSGoogle.signIn();
    });
    els.signOutBtn.addEventListener("click", function () {
      ETSGoogle.signOut();
    });
  }

  function boot() {
    cacheEls();
    bind();
    SLOT_STATUSES.forEach(function (status) {
      const opt = document.createElement("option");
      opt.value = status;
      opt.textContent = status;
      els.invStatus.appendChild(opt);
    });
    MISSING_FLOW.forEach(function (status) {
      const opt = document.createElement("option");
      opt.value = status;
      opt.textContent = status;
      els.missStatus.appendChild(opt);
    });
    fillInvForm(emptyInvForm());
    fillMissForm(emptyMissForm());
    applyData(ETSStorage.load(), true);
    ETSGoogle.init({
      onStatus: renderSync,
      onData: function (data) {
        applyData(data, true);
        ETSStorage.save({
          inventory: data.inventory,
          missing: data.missing,
          updatedAt: new Date().toISOString(),
        });
      },
      getData: function () {
        return { inventory: state.inventory, missing: state.missing };
      },
      isDirty: function () {
        return state.dirty;
      },
      markClean: function () {
        state.dirty = false;
      },
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
