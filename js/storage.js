(function (global) {
  const KEY = "ets-data-v1";

  function emptyData() {
    return { inventory: [], missing: [], updatedAt: null };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyData();
      const parsed = JSON.parse(raw);
      return {
        inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
        missing: Array.isArray(parsed.missing) ? parsed.missing : [],
        updatedAt: parsed.updatedAt || null,
      };
    } catch (err) {
      return emptyData();
    }
  }

  function save(data) {
    const payload = {
      inventory: data.inventory || [],
      missing: data.missing || [],
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
    return payload;
  }

  function csvEscape(value) {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  function toCsv(headers, rows) {
    const lines = [headers.map(csvEscape).join(",")];
    for (const row of rows) {
      lines.push(headers.map((key) => csvEscape(row[key])).join(","));
    }
    return lines.join("\n");
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type: type || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function exportJSON(data) {
    download(
      "ets-data.json",
      JSON.stringify(
        {
          inventory: data.inventory || [],
          missing: data.missing || [],
          updatedAt: data.updatedAt || new Date().toISOString(),
        },
        null,
        2
      ),
      "application/json"
    );
  }

  function exportCSV(data) {
    const invHeaders = [
      "slot",
      "catalogNumber",
      "name",
      "description",
      "quantity",
      "status",
    ];
    const missHeaders = [
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
    download(
      "ets-inventory.csv",
      toCsv(invHeaders, data.inventory || []),
      "text/csv"
    );
    download(
      "ets-missing.csv",
      toCsv(missHeaders, data.missing || []),
      "text/csv"
    );
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("That file is not ETS data.");
    }
    const inventory = Array.isArray(parsed.inventory) ? parsed.inventory : [];
    const missing = Array.isArray(parsed.missing) ? parsed.missing : [];
    return save({
      inventory,
      missing,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    });
  }

  global.ETSStorage = {
    KEY,
    emptyData,
    load,
    save,
    exportJSON,
    exportCSV,
    importJSON,
  };
})(window);
