// ==UserScript==
// @name         Eden Assistant
// @namespace    eden-assistant
// @version      0.27
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

    const VERSION = "0.27";
    const ACTIVE_WIP = "31474";
    const ACTIVE_VEHICLE = "KO24 LZL";
    const MAX_WORK_DESCRIPTION_LENGTH = 96;
    const WINDOW_MARKER = "EDEN_ASSISTANT_PENDING:";

    const VEHICLE_PROFILES = {
        "31726": {
            inspection: {
                defaultColour: "green",
                colours: {},
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
        },
        "31474": {
            inspection: {
                defaultColour: "green",
                colours: { "Misc": "red" },
                comments: {
                    "Brake Pads/Shoes - Front": "Current 11.0 mm; minimum 2.5 mm; approximately 100% remaining.",
                    "Brake Discs/Drums - Front": "Current 29.8 mm; minimum 28.0 mm; approximately 90% remaining.",
                    "Brake Pads/Shoes - Rear": "Current 8.0 mm; minimum 2.0 mm; approximately 75% remaining.",
                    "Brake Discs/Drums - Rear": "Current 9.8 mm; minimum 8.0 mm; approximately 90% remaining.",
                    "Misc": "Fuel flap damaged. Charging pad inoperative. Recommend replacement and diagnosis."
                }
            },
            tyres: {
                fl: { outer: 4, mid: 4, inner: 4, make: "MICHELIN", size: "235/50 R19 103V", notes: "" },
                fr: { outer: 4, mid: 4, inner: 4, make: "MICHELIN", size: "235/50 R19 103V", notes: "" },
                rl: { outer: 5, mid: 5, inner: 5, make: "MICHELIN", size: "235/50 R19 103V", notes: "" },
                rr: { outer: 5, mid: 5, inner: 5, make: "MICHELIN", size: "235/50 R19 103V", notes: "" }
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
        if (!element) return;
        if (window.jQuery) window.jQuery(element).trigger("click");
        else if (typeof element.click === "function") element.click();
        else element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, composed: true, view: window }));
    }

    function writePendingMarker() {
        window.name = `${WINDOW_MARKER}${ACTIVE_WIP}`;
    }

    function readPendingMarker() {
        const value = String(window.name || "");
        return value.startsWith(WINDOW_MARKER) ? value.slice(WINDOW_MARKER.length) : "";
    }

    function clearPendingMarker() {
        if (String(window.name || "").startsWith(WINDOW_MARKER)) window.name = "";
    }

    function findEdenVueTile() {
        return Array.from(document.querySelectorAll("a")).find(anchor => {
            const text = String(anchor.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
            const href = String(anchor.getAttribute("href") || "").toLowerCase();
            return text.includes("eden 1 vue") || href.includes("dealcrm_codeweavers/main.asp");
        }) || null;
    }

    async function openEdenVue() {
        const tile = await waitForElement(() => {
            const element = findEdenVueTile();
            return element && isVisible(element) ? element : null;
        }, 12000);
        if (!tile) throw new Error("Eden 1 Vue tile not found");

        writePendingMarker();
        tile.setAttribute("target", "_self");
        tile.scrollIntoView({ block: "center", inline: "center" });
        setStatus(`Opening Eden 1 Vue • WIP ${ACTIVE_WIP}...`);
        await sleep(200);
        triggerClick(tile);
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
            const colour = profile.colours?.[item] || profile.defaultColour;
            setStatus(`Inspection ${i + 1}/${rows.length}: ${item}`);
            await setInspectionRow(row, colour, profile.comments[item] || "");
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
        if (!profile) throw new Error(`No prepared profile for WIP ${wip}`);
        await fillInspection(profile.inspection);
        await fillTyres(profile.tyres);
        clearPendingMarker();
        setStatus(`WIP ${wip}: filled — CHECK BEFORE SAVE`);
    }

    async function runDealfileFlow(wip) {
        setStatus(`Looking for WIP ${wip} field...`);
        const input = await waitForElement(() => {
            const element = document.getElementById("x_searchwip");
            return isVisible(element) ? element : null;
        }, 30000);
        if (!input) throw new Error("WIP field not found");
        input.focus();
        setInputValue(input, wip);
        await sleep(500);

        const search = await waitForElement(() => {
            const element = document.getElementById("mainsearchbuts_serv");
            return isVisible(element) ? element : null;
        }, 12000);
        if (!search) throw new Error("Search control not found");

        setStatus(`Searching WIP ${wip}...`);
        triggerClick(search);
        await openTab("vhctab_inpection", "vhcinspection", "#vhcinspection");
        await applyVehicleProfile(wip);
    }

    async function runAssistant() {
        const button = document.getElementById("edenAssistantButton");
        if (button) { button.disabled = true; button.textContent = "WORKING..."; }
        try {
            if (location.hostname === "login.eden1vision.com") {
                await openEdenVue();
                return;
            }
            if (location.hostname === "eden.dealfile.co.uk") {
                writePendingMarker();
                await runDealfileFlow(ACTIVE_WIP);
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
        Object.assign(panel.style, { position: "fixed", right: "10px", bottom: "85px", zIndex: "2147483647", display: "flex", flexDirection: "column", gap: "8px", width: "220px" });

        const status = document.createElement("div");
        status.id = "edenAssistantStatus";
        status.textContent = `Eden Assistant v${VERSION}`;
        Object.assign(status.style, { padding: "9px 12px", borderRadius: "9px", background: "#263238", color: "#fff", fontSize: "13px", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.45)" });

        const vehicleInfo = document.createElement("div");
        vehicleInfo.textContent = `WIP ${ACTIVE_WIP} • ${ACTIVE_VEHICLE}`;
        Object.assign(vehicleInfo.style, { boxSizing: "border-box", width: "100%", padding: "12px", border: "2px solid #1565c0", borderRadius: "10px", background: "#fff", color: "#111", fontSize: "17px", fontWeight: "bold", textAlign: "center", boxShadow: "0 3px 10px rgba(0,0,0,.35)" });

        const button = document.createElement("button");
        button.id = "edenAssistantButton";
        button.textContent = "START";
        Object.assign(button.style, { padding: "14px 17px", border: "2px solid white", borderRadius: "12px", background: "#1565c0", color: "#fff", fontSize: "16px", fontWeight: "bold", boxShadow: "0 3px 10px rgba(0,0,0,.45)" });
        button.addEventListener("click", runAssistant);

        panel.append(status, vehicleInfo, button);
        document.body.appendChild(panel);
    }

    createPanel();
    new MutationObserver(createPanel).observe(document.documentElement, { childList: true, subtree: true });

    if (location.hostname === "eden.dealfile.co.uk") {
        const pendingWip = readPendingMarker();
        if (pendingWip === ACTIVE_WIP) {
            setTimeout(() => runDealfileFlow(ACTIVE_WIP), 1800);
        }
    }
})();