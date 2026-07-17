// ==UserScript==
// @name         Eden Assistant
// @namespace    eden-assistant
// @version      0.29
// @description  Opens the prepared WIP and fills Inspection and Tyres without saving or completing the VHC
// @match        https://login.eden1vision.com/*
// @match        https://eden.dealfile.co.uk/*
// @updateURL    https://raw.githubusercontent.com/viktor322641/Eden-Assistant/main/Eden-Assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/viktor322641/Eden-Assistant/main/Eden-Assistant.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const VERSION = "0.29";
    const ACTIVE_WIP = "31401";
    const ACTIVE_VEHICLE = "DL74 VVW";
    const MAX_DESCRIPTION = 96;
    const MARKER = "EDEN_ASSISTANT_PENDING:";

    const PROFILE = {
        inspection: {
            defaultColour: "green",
            colours: {},
            comments: {
                "Brake Pads/Shoes - Front": "Current 11.0 mm; minimum 2.0 mm; good condition.",
                "Brake Discs/Drums - Front": "Current 29.8 mm; minimum 28.0 mm; good condition.",
                "Brake Pads/Shoes - Rear": "Current 9.0 mm; minimum 2.0 mm; good condition.",
                "Brake Discs/Drums - Rear": "Current 10.0 mm; minimum 8.0 mm; good condition."
            }
        },
        tyres: {
            fl: { outer: 3, mid: 3, inner: 3, make: "MICHELIN", size: "235/50 R19", notes: "Non-repairable puncture near outer shoulder. Replace NSF tyre.", status: "Red" },
            fr: { outer: 3, mid: 3, inner: 3, make: "MICHELIN", size: "235/50 R19", notes: "", status: "Green" },
            rl: { outer: 4, mid: 4, inner: 4, make: "MICHELIN", size: "235/50 R19", notes: "", status: "Green" },
            rr: { outer: 4, mid: 4, inner: 4, make: "MICHELIN", size: "235/50 R19", notes: "", status: "Green" }
        }
    };

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function visible(el) {
        if (!el) return false;
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
    }

    async function waitFor(find, timeout = 20000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = find();
            if (el) return el;
            await sleep(350);
        }
        return null;
    }

    function status(text, error = false) {
        console.log("[Eden Assistant]", text);
        const el = document.getElementById("edenAssistantStatus");
        if (el) {
            el.textContent = text;
            el.style.background = error ? "#b71c1c" : "#263238";
        }
    }

    function setValue(el, value) {
        const text = String(value ?? "");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(el, text); else el.value = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (window.jQuery) window.jQuery(el).val(text).trigger("input").trigger("change");
    }

    function commit(el) {
        if (window.jQuery) window.jQuery(el).trigger("change").trigger("blur");
        else {
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
            el.blur();
        }
    }

    function click(el) {
        if (!el) return;
        if (window.jQuery) window.jQuery(el).trigger("click");
        else el.click();
    }

    function writeMarker() { window.name = MARKER + ACTIVE_WIP; }
    function readMarker() { return String(window.name || "").startsWith(MARKER) ? String(window.name).slice(MARKER.length) : ""; }
    function clearMarker() { if (String(window.name || "").startsWith(MARKER)) window.name = ""; }

    async function openEdenVue() {
        const tile = await waitFor(() => Array.from(document.querySelectorAll("a")).find(a => {
            const text = String(a.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
            const href = String(a.getAttribute("href") || "").toLowerCase();
            return visible(a) && (text.includes("eden 1 vue") || href.includes("dealcrm_codeweavers/main.asp"));
        }), 12000);
        if (!tile) throw new Error("Eden 1 Vue tile not found");
        writeMarker();
        tile.target = "_self";
        tile.scrollIntoView({ block: "center" });
        status(`Opening Eden 1 Vue • WIP ${ACTIVE_WIP}...`);
        await sleep(250);
        click(tile);
    }

    async function openTab(id, paneId, href) {
        const tab = await waitFor(() => {
            const el = document.getElementById(id) || document.querySelector(`a[href="${href}"]`);
            return visible(el) ? el : null;
        });
        if (!tab) throw new Error(`${paneId} tab not found`);
        if (window.jQuery && typeof window.jQuery(tab).tab === "function") window.jQuery(tab).tab("show");
        else click(tab);
        const pane = await waitFor(() => visible(document.getElementById(paneId)) ? document.getElementById(paneId) : null, 10000);
        if (!pane) throw new Error(`${paneId} did not open`);
        await sleep(600);
    }

    async function fillInspection() {
        const rows = Array.from(document.querySelectorAll("#vhcinspection .servline_vhc[job]"));
        if (!rows.length) throw new Error("Inspection rows not found");
        const selectors = {
            green: ".vhcbtn.btn-success, .vhcbtn[class*='_green']",
            amber: ".vhcbtn.btn-warning, .vhcbtn[class*='_amber']",
            red: ".vhcbtn.btn-danger, .vhcbtn[class*='_red']"
        };
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const item = String(row.getAttribute("job") || "").trim();
            const colour = PROFILE.inspection.colours[item] || PROFILE.inspection.defaultColour;
            status(`Inspection ${i + 1}/${rows.length}: ${item}`);
            click(row.querySelector(selectors[colour]));
            await sleep(300);
            const input = row.querySelector("input.vhcjobdesc, input[id^='vhcjobdesc_']");
            if (input) {
                input.maxLength = MAX_DESCRIPTION;
                setValue(input, String(PROFILE.inspection.comments[item] || "").slice(0, MAX_DESCRIPTION));
                commit(input);
                await sleep(300);
            }
        }
    }

    async function fillTyre(side, data) {
        for (const field of ["outer", "mid", "inner", "make", "size", "notes"]) {
            const el = document.getElementById(`x_${side}_${field}`);
            if (!el) continue;
            setValue(el, data[field]);
            commit(el);
            await sleep(450);
        }
        const hidden = document.getElementById(`x_${side}_statusid`);
        if (hidden) { setValue(hidden, data.status); commit(hidden); }
    }

    async function fillTyres() {
        await openTab("vhctab_tyres", "vhctyres", "#vhctyres");
        for (const side of ["fl", "fr", "rl", "rr"]) {
            status(`Tyres: ${side.toUpperCase()}`);
            await fillTyre(side, PROFILE.tyres[side]);
        }
    }

    async function runDealfile() {
        const input = await waitFor(() => {
            const el = document.getElementById("x_searchwip");
            return visible(el) ? el : null;
        }, 30000);
        if (!input) throw new Error("WIP field not found");
        setValue(input, ACTIVE_WIP);
        await sleep(500);
        const search = await waitFor(() => {
            const el = document.getElementById("mainsearchbuts_serv");
            return visible(el) ? el : null;
        }, 12000);
        if (!search) throw new Error("Search control not found");
        status(`Searching WIP ${ACTIVE_WIP}...`);
        click(search);
        await openTab("vhctab_inpection", "vhcinspection", "#vhcinspection");
        await fillInspection();
        await fillTyres();
        clearMarker();
        status(`WIP ${ACTIVE_WIP}: filled — CHECK BEFORE SAVE`);
    }

    async function run() {
        const button = document.getElementById("edenAssistantButton");
        if (button) { button.disabled = true; button.textContent = "WORKING..."; }
        try {
            if (location.hostname === "login.eden1vision.com") await openEdenVue();
            else if (location.hostname === "eden.dealfile.co.uk") { writeMarker(); await runDealfile(); }
            else status("Unsupported page", true);
        } catch (e) {
            console.error(e);
            status(`Error: ${e.message || e}`, true);
        } finally {
            if (button) { button.disabled = false; button.textContent = "START"; }
        }
    }

    function panel() {
        if (document.getElementById("edenAssistantPanel") || !document.body) return;
        const box = document.createElement("div");
        box.id = "edenAssistantPanel";
        Object.assign(box.style, { position: "fixed", right: "10px", bottom: "85px", zIndex: "2147483647", display: "flex", flexDirection: "column", gap: "8px", width: "220px" });
        const s = document.createElement("div");
        s.id = "edenAssistantStatus";
        s.textContent = `Eden Assistant v${VERSION}`;
        Object.assign(s.style, { padding: "9px 12px", borderRadius: "9px", background: "#263238", color: "#fff", fontSize: "13px", textAlign: "center" });
        const info = document.createElement("div");
        info.textContent = `WIP ${ACTIVE_WIP} • ${ACTIVE_VEHICLE}`;
        Object.assign(info.style, { padding: "12px", border: "2px solid #1565c0", borderRadius: "10px", background: "#fff", color: "#111", fontSize: "17px", fontWeight: "bold", textAlign: "center" });
        const b = document.createElement("button");
        b.id = "edenAssistantButton";
        b.textContent = "START";
        Object.assign(b.style, { padding: "14px 17px", border: "2px solid white", borderRadius: "12px", background: "#1565c0", color: "#fff", fontSize: "16px", fontWeight: "bold" });
        b.addEventListener("click", run);
        box.append(s, info, b);
        document.body.appendChild(box);
    }

    panel();
    new MutationObserver(panel).observe(document.documentElement, { childList: true, subtree: true });
    if (location.hostname === "eden.dealfile.co.uk" && readMarker() === ACTIVE_WIP) setTimeout(runDealfile, 1800);
})();