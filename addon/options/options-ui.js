const OptionsUI = {
  getOptionsSchema: async () => {
    const res = await browser.runtime.sendMessage({type: "OPTIONS_SCHEMA"});
    return res.body;
  },

  // option object with name and value
  onSaveOption: async (o) => {
    const type = "OPTIONS_ONSAVE";
    const res = await browser.runtime.sendMessage({
      type,
      body: {
        name: o.name,
        value: o.value
      }
    });
    if (res.type === type) {
      return res.body.value;
    }
    throw new Error("Invalid option");
  },

  saveOptions: async (e) => {
    if (e) {
      e.preventDefault();
    }
    const schema = await OptionsUI.getOptionsSchema();
    const toSave = await schema.keys.reduce(async (accP, val) => {
      const acc = await accP;
      const opt = (val.type === schema.types.RADIO) ? ":checked" : "";
      const sel = `[name=${val.name}]${opt}`;
      const el = document.querySelector(sel);
      if (!el) {
        console.warn("Element not found", sel); /* RemoveLogging:skip */
        return acc;
      }
      const propMap = {
        [schema.types.BOOL]: "checked",
        [schema.types.RADIO]: "value",
        [schema.types.VALUE]: "value"
      };
      // const fn = val.onSave || (x => x);
      // const optionValue = fn(el[propMap[val.type]]);
      let optionValue = el[propMap[val.type]];
      // validate radio options
      if (
        val.type === schema.types.RADIO &&
        val.values &&
        !val.values.includes(optionValue)
      ) {
        console.warn("Invalid radio option", optionValue, val.values); /* RemoveLogging:skip */
        optionValue = val.default;
      }
      if (val.regex) {
        let re = new RegExp(val.regex);
        if (!re.test(optionValue)) {
          console.warn(`Regex failed for ${val.name}:${optionValue}`);
          optionValue = val.default;
        }
      }
      if (val.onSave) {
        try {
          optionValue = await OptionsUI.onSaveOption({name: val.name, value: optionValue});
        } catch (err) {
          console.debug("onSave rejected");
          optionValue = val.default;
          // TODO UI error message
        }
      }

      return Object.assign(acc, {[val.name]: optionValue});
    }, {});
    console.debug("toSave", toSave);

    await browser.storage.local.set(toSave);
    // redraw ui incase some options where rejected
    OptionsUI.restoreOptions(toSave, schema);
  },

  // Set UI elements' value/checked
  restoreOptions: (result, schema) => {
    const schemaWithValues = schema.keys.map((o) =>
      Object.assign({}, o, {value: result[o.name]})
    );
    schemaWithValues.forEach((o) => {
      // const fn = o.onOptionsLoad || (x => x); // onLoad is triggered in background script
      const val = typeof o.value === "undefined" ? o.default : o.value;
      const opt = (o.type === schema.types.RADIO) ? `[value=${val}]` : "";
      const sel = `[name=${o.name}]${opt}`;
      const el = document.querySelector(sel);
      if (!el) {
        console.warn("Element not found", sel); /* RemoveLogging:skip */
        return;
      }

      const propMap = {
        [schema.types.BOOL]: "checked",
        [schema.types.RADIO]: "checked",
        [schema.types.VALUE]: "value"
      };
      el[propMap[o.type]] = val;
    });
  },

  // load options from local storage and populate the UI
  restoreOptionsHandler: async () => {
    const schema = await OptionsUI.getOptionsSchema();
    const keys = schema.keys.map((o) => o.name);
    const loaded = await browser.storage.local.get(keys);
    OptionsUI.restoreOptions(loaded, schema);
  },

  setupAutosave: (el) => {
    const autosaveCb = (e) => {
      console.debug("autosaveCb", e);
      OptionsUI.saveOptions(e);
    };
    try {
      el.addEventListener("change", autosaveCb);
    } catch (err) {
      // TODO show UI error
      console.warn("Failed to add listener", el, err); /* RemoveLogging:skip */
    }
  }
};

document.addEventListener("DOMContentLoaded", OptionsUI.restoreOptionsHandler);

["textarea", "input", "select"].forEach((type) => {
  document.querySelectorAll(type).forEach(OptionsUI.setupAutosave);
});

// Export for testing
if (typeof module !== "undefined") {
  module.exports = {OptionsUI};
}
