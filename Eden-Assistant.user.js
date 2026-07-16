// ==UserScript==
// @name         Eden Assistant
// @namespace    eden-assistant
// @version      0.24
// @description  Opens a WIP and fills prepared Inspection and Tyres data without saving or completing the VHC
// @match        https://login.eden1vision.com/*
// @match        https://eden.dealfile.co.uk/*
// @updateURL    https://raw.githubusercontent.com/viktor322641/Eden-Assistant/main/Eden-Assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/viktor322641/Eden-Assistant/main/Eden-Assistant.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const VERSION = "0.24";
    const MAX_WORK_DESCRIPTION_LENGTH = 96;
    const STORAGE_KEY = "edenAssistantWip";
    const AUTO_HASH = "#eden-assistant-search-wip";
    const EDEN_VUE_URL = "https://eden.dealfile.co.uk/dealcrm_codeweavers/main.asp";

    const VEHICLE_PROFILES = {
        "31726": {
            inspection: {
                defaultColour: "green",
                comments: {
                    "Brake Pads/Shoes - Front": "Current 4.3 mm; minimum 2.0 mm; approximately 26% remaining.",
                    "Brake Discs/Drums - Front": "LH 27.2 mm, RH 27.0 mm; minimum 26.0 mm; 60%/50% remaining.",
                    "Brake Pads/Shoes - Rear": "Current 7.0 mm; minimum 2.0 mm; approximately 71% remaining.",
                    "Brake Discs/Drums - Rear": "Current 9.9 mm; minimum 8.0 mm; approximately 95% remaining."
                }
            },
            tyres: {
                fl: { outer: 5, mid: 5, inner: 5, make: "TOYO", size: "225/55 R19 99V", notes: "" },
                fr: { outer: 5, mid: 5, inner: 5, make: "TOYO", size: "225/55 R19 99V", notes: "" },
                rl: { outer: 7, mid: 7, inner: 7, make: "TOYO", size: "225/55 R19 99V", notes: "" },
                rr: { outer: 7, mid: 7, inner: 7, make: "TOYO", size: "225/55 R19 99V", notes: "" }
            }
        }
    };

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function isVisible(element) {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    }

    function setStatus(message, isError = false) {
        console.log("[Eden Assistant]", message);
        const status = document.getElementById("edenAssistantStatus");
        if (!status) return;
        status.textContent = message;
        status.style.background = isError ? "#b71c1c" : "#263238";
    }

    async function waitForElement(finder, timeout = 15000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const element = finder();
            if (element) return element;
            await sleep(400);
        }
        return null;
    }

    function setInputValue(input, value) {
        const text = String(value ?? "");
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (setter) setter.call(input, text); else input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        if (window.jQuery) window.jQuery(input).val(text).trigger("input").trigger("change");
    }

    function commitInput(input) {
        if (window.jQuery) window.jQuery(input).trigger("change").trigger("blur");
        else {
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
            input.blur();
        }
    }

    function triggerClick(element) {
        if (window.jQuery) window.jQuery(element).trigger("click");
        else element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, view: window }));
    }

    function normaliseWip(value) {
        return String(value || "").replace(/\D/g, "").trim();
    }

    function getEnteredWip() {
        return normaliseWip(document.getElementById("edenAssistantWipInput")?.value || localStorage.getItem(STORAGE_KEY) || "");
    }

    async function openTab(tabId, paneId, href) {
        const tab = await waitForElement(() => {
            const element = document.getElementById(tabId) || document.querySelector(`a[href="${href}"]`);
            return isVisible(element) ? element : null;
        }, 20000);
        if (!tab) throw new Error(`${paneId} tab not found`);
        if (window.jQuery && typeof window.jQuery(tab).tab === "function") window.jQuery(tab).tab("show");
        else triggerClick(tab);
        const pane = await waitForElement(() => {
            const element = document.getElementById(paneId);
            return isVisible(element) ? element : null;
        }, 10000);
        if (!pane) throw new Error(`${paneId} did not open`);
        await sleep(600);
        return true;
    }

    async function setInspectionRow(row, colour, description = "") {
        const selectors = {
            green: ".vhcbtn.btn-success, .vhcbtn[class*='_green']",
            amber: ".vhcbtn.btn-warning, .vhcbtn[class*='_amber']",
            red: ".vhcbtn.btn-danger, .vhcbtn[class*='_red']"
        };
        const button = row.querySelector(selectors[colour]);
        if (!button) return false;
        triggerClick(button);
        await sleep(350);
        const input = row.querySelector("input.vhcjobdesc, input[id^='vhcjobdesc_']");
        if (input) {
            input.maxLength = MAX_WORK_DESCRIPTION_LENGTH;
            input.focus();
            setInputValue(input, String(description).slice(0, MAX_WORK_DESCRIPTION_LENGTH));
            commitInput(input);
            await sleep(350);
        }
        return true;
    }

    async function fillInspection(profile) {
        const rows = Array.from(document.querySelectorAll("#vhcinspection .servline_vhc[job]"));
        if (!rows.length) throw new Error("Inspection rows not found");
        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            const item = String(row.getAttribute("job") || "").trim();
            setStatus(`Inspection ${i + 1}/${rows.length}: ${item}`);
            await setInspectionRow(row, profile.defaultColour, profile.comments[item] || "");
        }
    }

    async function setTyre(side, data) {
        for (const name of ["outer", "mid", "inner", "make", "size", "notes"]) {
            const element = document.getElementById(`x_${side}_${name}`);
            if (!element || !(name in data)) continue;
            element.focus();
            setInputValue(element, data[name]);
            await sleep(120);
            commitInput(element);
            await sleep(550);
        }
    }

    async function fillTyres(tyres) {
        await openTab("vhctab_tyres", "vhctyres", "#vhctyres");
        for (const side of ["fl", "fr", "rl", "rr"]) {
            setStatus(`Tyres: ${side.toUpperCase()}`);
            await setTyre(side, tyres[side]);
        }
    }

    async function applyVehicleProfile(wip) {
        const profile = VEHICLE_PROFILES[wip];
        if (!profile) {
            setStatus(`WIP ${wip}: no prepared data; Inspection opened`);
            return;
        }
        await fillInspection(profile.inspection);
        await fillTyres(profile.tyres);
        setStatus(`WIP ${wip}: filled — CHECK BEFORE SAVE`);
    }

    async function runDealfileFlow(wip) {
        setStatus("Looking for WIP field...");
        const input = await waitForElement(() => {
            const element = document.getElementById("x_searchwip");
            return isVisible(element) ? element : null;
        }, 20000);
        if (!input) throw new Error("WIP field not found");
        input.focus();
        setInputValue(input, wip);
        await sleep(500);
        const search = await waitForElement(() => {
            const element = document.getElementById("mainsearchbuts_serv");
            return isVisible(element) ? element : null;
        }, 10000);
        if (!search) throw new Error("Search control not found");
        setStatus(`Searching WIP ${wip}...`);
        triggerClick(search);
        await openTab("vhctab_inpection", "vhcinspection", "#vhcinspection");
        await applyVehicleProfile(wip);
    }

    async function runAssistant() {
        const wip = getEnteredWip();
        const button = document.getElementById("edenAssistantButton");
        if (!wip) {
            setStatus("Enter WIP No", true);
            return;
        }
        localStorage.setItem(STORAGE_KEY, wip);
        if (button) { button.disabled = true; button.textContent = "WORKING..."; }
        try {
            if (location.hostname === "login.eden1vision.com") {
                setStatus(`Open Eden 1 Vue manually, then press START for WIP ${wip}`);
                return;
            }
            if (location.hostname === "eden.dealfile.co.uk") {
                await runDealfileFlow(wip);
                return;
            }
            setStatus("Unsupported page", true);
        } catch (error) {
            console.error(error);
            setStatus(`Error: ${error.message || error}`, true);
        } finally {
            if (button) { button.disabled = false; button.textContent = "START"; }
        }
    }

    function createPanel() {
        if (document.getElementById("edenAssistantPanel") || !document.body) return;
        const panel = document.createElement("div");
        panel.id = "edenAssistantPanel";
        Object.assign(panel.style, { position: "fixed", right: "10px", bottom: "85px", zIndex: "2147483647", display: "flex", flexDirection: "column", gap: "8px", width: "210px" });
        const status = document.createElement("div");
        status.id = "edenAssistantStatus";
        status.textContent = `Eden Assistant v${VERSION}`;
        Object.assign(status.style, { padding: "9px 12px", borderRadius: "9px", background: "#263238", color: "#fff", fontSize: "13px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" });
        const input = document.createElement("input");
        input.id = "edenAssistantWipInput";
        input.type = "tel";
        input.inputMode = "numeric";
        input.placeholder = "WIP No";
        input.value = localStorage.getItem(STORAGE_KEY) || "";
        Object.assign(input.style, { boxSizing: "border-box", width: "100%", padding: "12px", border: "2px solid #1565c0", borderRadius: "10px", background: "#fff", color: "#111", fontSize: "18px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.35)" });
        input.addEventListener("input", () => { input.value = normaliseWip(input.value); });
        input.addEventListener("keydown", event => { if (event.key === "Enter") runAssistant(); });
        const button = document.createElement("button");
        button.id = "edenAssistantButton";
        button.textContent = "START";
        Object.assign(button.style, { padding: "14px 17px", border: "2px solid white", borderRadius: "12px", background: "#1565c0", color: "#fff", fontSize: "16px", fontWeight: "bold", boxShadow: "0 3px 10px rgba(0,0,0,.45)" });
        button.addEventListener("click", runAssistant);
        panel.append(status, input, button);
        document.body.appendChild(panel);
    }

    createPanel();
    new MutationObserver(createPanel).observe(document.documentElement, { childList: true, subtree: true });

    if (location.hostname === "eden.dealfile.co.uk" && location.hash === AUTO_HASH) {
        history.replaceState(null, "", location.pathname + location.search);
        const wip = normaliseWip(localStorage.getItem(STORAGE_KEY));
        if (wip) setTimeout(() => runDealfileFlow(wip), 1200);
    }
})();
