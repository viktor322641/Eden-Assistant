// ==UserScript==
// @name         Eden Assistant
// @namespace    eden-assistant
// @version      0.23
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

    const VERSION = "0.23";
    const MAX_WORK_DESCRIPTION_LENGTH = 96;
    const STORAGE_KEY = "edenAssistantWip";
    const AUTO_HASH = "#eden-assistant-search-wip";
    const EDEN_VUE_URL =
        "https://eden.dealfile.co.uk/dealcrm_codeweavers/main.asp";

    const VEHICLE_PROFILES = {
        "31480": {
            inspection: {
                defaultColour: "green",
                comments: {
                    "Brake Pads/Shoes - Front": "Current 11.0 mm; minimum 2.0 mm; approximately 95% remaining.",
                    "Brake Discs/Drums - Front": "Current 25.8 mm; minimum 23.0 mm; approximately 100% remaining.",
                    "Brake Pads/Shoes - Rear": "Current 7.0 mm; minimum 2.0 mm; approximately 63% remaining.",
                    "Brake Discs/Drums - Rear": "Current 9.9 mm; minimum 8.4 mm; approximately 94% remaining."
                }
            },
            tyres: {
                fl: { outer: 4, mid: 4, inner: 4, make: "AVON", size: "215/55 R17 94W", notes: "" },
                fr: { outer: 4, mid: 4, inner: 4, make: "AVON", size: "215/55 R17 94W", notes: "" },
                rl: { outer: 8, mid: 8, inner: 8, make: "GOODYEAR", size: "215/55 R17 94W", notes: "" },
                rr: { outer: 4, mid: 4, inner: 4, make: "MICHELIN", size: "215/55 R17 94W", notes: "" }
            }
        }
    };

    const sleep = milliseconds =>
        new Promise(resolve => setTimeout(resolve, milliseconds));

    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 && rect.height > 0;
    }

    function setStatus(message, isError = false) {
        console.log("[Eden Assistant]", message);
        const status = document.getElementById("edenAssistantStatus");
        if (!status) return;
        status.textContent = message;
        status.style.background = isError ? "#b71c1c" : "#263238";
    }

    async function waitForElement(finder, timeout = 15000) {
        const started = Date.now();
        while (Date.now() - started < timeout) {
            const element = finder();
            if (element) return element;
            await sleep(400);
        }
        return null;
    }

    function setInputValue(input, value) {
        const stringValue = String(value ?? "");
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )?.set;

        if (setter) setter.call(input, stringValue);
        else input.value = stringValue;

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));

        if (window.jQuery) {
            window.jQuery(input)
                .val(stringValue)
                .trigger("input")
                .trigger("change");
        }
    }

    function commitInput(input) {
        if (window.jQuery) {
            window.jQuery(input).trigger("change").trigger("blur");
        } else {
            input.dispatchEvent(new Event("change", { bubbles: true }));
            input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
            input.blur();
        }
    }

    function triggerClick(element) {
        if (window.jQuery) {
            window.jQuery(element).trigger("click");
            return;
        }
        element.dispatchEvent(new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
        }));
    }

    function normaliseWip(value) {
        return String(value || "").replace(/\D/g, "").trim();
    }

    function getEnteredWip() {
        const panelInput = document.getElementById("edenAssistantWipInput");
        return normaliseWip(
            panelInput?.value || localStorage.getItem(STORAGE_KEY) || ""
        );
    }

    function limitWorkDescription(value) {
        return String(value ?? "").slice(0, MAX_WORK_DESCRIPTION_LENGTH);
    }

    async function openTab(tabId, paneId, href) {
        const tab = await waitForElement(() => {
            const element = document.getElementById(tabId) ||
                document.querySelector(`a[href="${href}"]`);
            return isVisible(element) ? element : null;
        }, 20000);

        if (!tab) {
            setStatus(`${paneId} tab not found`, true);
            return false;
        }

        if (window.jQuery && typeof window.jQuery(tab).tab === "function") {
            window.jQuery(tab).tab("show");
        } else {
            triggerClick(tab);
        }

        const pane = await waitForElement(() => {
            const element = document.getElementById(paneId);
            return isVisible(element) ? element : null;
        }, 10000);

        if (!pane) {
            setStatus(`${paneId} did not open`, true);
            return false;
        }

        await sleep(600);
        return true;
    }

    function getInspectionRows() {
        return Array.from(
            document.querySelectorAll("#vhcinspection .servline_vhc[job]")
        );
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

        const input = row.querySelector(
            "input.vhcjobdesc, input[id^='vhcjobdesc_']"
        );
        if (input) {
            input.maxLength = MAX_WORK_DESCRIPTION_LENGTH;
            input.focus();
            setInputValue(input, limitWorkDescription(description));
            commitInput(input);
            await sleep(350);
        }
        return true;
    }

    async function fillInspection(profile) {
        const rows = getInspectionRows();
        if (!rows.length) throw new Error("Inspection rows not found");

        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index];
            const itemName = String(row.getAttribute("job") || "").trim();
            const description = profile.comments[itemName] || "";
            setStatus(`Inspection ${index + 1}/${rows.length}: ${itemName}`);
            await setInspectionRow(row, profile.defaultColour, description);
        }
    }

    async function setTyre(side, data) {
        const fields = {
            outer: document.getElementById(`x_${side}_outer`),
            mid: document.getElementById(`x_${side}_mid`),
            inner: document.getElementById(`x_${side}_inner`),
            make: document.getElementById(`x_${side}_make`),
            size: document.getElementById(`x_${side}_size`),
            notes: document.getElementById(`x_${side}_notes`)
        };

        for (const [name, element] of Object.entries(fields)) {
            if (!element || !(name in data)) continue;
            element.focus();
            setInputValue(element, data[name]);
            await sleep(120);
            commitInput(element);
            await sleep(550);
        }
    }

    async function fillTyres(tyres) {
        const opened = await openTab("vhctab_tyres", "vhctyres", "#vhctyres");
        if (!opened) throw new Error("Tyres tab did not open");

        for (const side of ["fl", "fr", "rl", "rr"]) {
            setStatus(`Tyres: ${side.toUpperCase()}`);
            await setTyre(side, tyres[side]);
        }
    }

    async function applyVehicleProfile(wipNumber) {
        const profile = VEHICLE_PROFILES[wipNumber];
        if (!profile) {
            setStatus(`WIP ${wipNumber}: no prepared data; Inspection opened`);
            return;
        }

        await fillInspection(profile.inspection);
        await fillTyres(profile.tyres);
        setStatus(`WIP ${wipNumber}: filled — CHECK BEFORE SAVE`);
    }

    async function runDealfileFlow(wipNumber) {
        setStatus("Looking for WIP field...");
        const input = await waitForElement(() => {
            const element = document.getElementById("x_searchwip");
            return isVisible(element) ? element : null;
        }, 20000);

        if (!input) throw new Error("WIP field not found");

        input.focus();
        setInputValue(input, wipNumber);
        await sleep(500);

        const searchButton = await waitForElement(() => {
            const element = document.getElementById("mainsearchbuts_serv");
            return isVisible(element) ? element : null;
        }, 10000);

        if (!searchButton) throw new Error("Search control not found");

        setStatus(`Searching WIP ${wipNumber}...`);
        triggerClick(searchButton);

        const opened = await openTab(
            "vhctab_inpection",
            "vhcinspection",
            "#vhcinspection"
        );
        if (!opened) return;

        await applyVehicleProfile(wipNumber);
    }

    async function runAssistant() {
        const wipNumber = getEnteredWip();
        const button = document.getElementById("edenAssistantButton");

        if (!wipNumber) {
            setStatus("Enter WIP No", true);
            document.getElementById("edenAssistantWipInput")?.focus();
            return;
        }

        localStorage.setItem(STORAGE_KEY, wipNumber);
        if (button) {
            button.disabled = true;
            button.textContent = "WORKING...";
        }

        try {
            if (location.hostname === "login.eden1vision.com") {
                setStatus(`Opening Eden 1 Vue for WIP ${wipNumber}...`);
                window.location.assign(EDEN_VUE_URL + AUTO_HASH);
                return;
            }
            if (location.hostname === "eden.dealfile.co.uk") {
                await runDealfileFlow(wipNumber);
                return;
            }
            setStatus("Unsupported page", true);
        } catch (error) {
            console.error(error);
            setStatus(`Error: ${error.message || error}`, true);
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = "START";
            }
        }
    }

    function createPanel() {
        if (document.getElementById("edenAssistantPanel")) return;
        if (!document.body) {
            setTimeout(createPanel, 500);
            return;
        }

        const panel = document.createElement("div");
        panel.id = "edenAssistantPanel";
        Object.assign(panel.style, {
            position: "fixed",
            right: "10px",
            bottom: "85px",
            zIndex: "2147483647",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            width: "210px"
        });

        const status = document.createElement("div");
        status.id = "edenAssistantStatus";
        status.textContent = `Eden Assistant v${VERSION}`;
        Object.assign(status.style, {
            padding: "9px 12px",
            borderRadius: "9px",
            background: "#263238",
            color: "#fff",
            fontSize: "13px",
            textAlign: "center",
            boxShadow: "0 3px 10px rgba(0,0,0,.45)"
        });

        const wipInput = document.createElement("input");
        wipInput.id = "edenAssistantWipInput";
        wipInput.type = "tel";
        wipInput.inputMode = "numeric";
        wipInput.placeholder = "WIP No";
        wipInput.value = localStorage.getItem(STORAGE_KEY) || "";
        Object.assign(wipInput.style, {
            boxSizing: "border-box",
            width: "100%",
            padding: "12px",
            border: "2px solid #1565c0",
            borderRadius: "10px",
            background: "#fff",
            color: "#111",
            fontSize: "18px",
            textAlign: "center",
            boxShadow: "0 3px 10px rgba(0,0,0,.35)"
        });
        wipInput.addEventListener("input", () => {
            wipInput.value = normaliseWip(wipInput.value);
        });
        wipInput.addEventListener("keydown", event => {
            if (event.key === "Enter") runAssistant();
        });

        const button = document.createElement("button");
        button.id = "edenAssistantButton";
        button.textContent = "START";
        Object.assign(button.style, {
            padding: "14px 17px",
            border: "2px solid white",
            borderRadius: "12px",
            background: "#1565c0",
            color: "#fff",
            fontSize: "16px",
            fontWeight: "bold",
            boxShadow: "0 3px 10px rgba(0,0,0,.45)"
        });
        button.addEventListener("click", runAssistant);

        panel.appendChild(status);
        panel.appendChild(wipInput);
        panel.appendChild(button);
        document.body.appendChild(panel);
    }

    createPanel();
    new MutationObserver(createPanel).observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    if (
        location.hostname === "eden.dealfile.co.uk" &&
        location.hash === AUTO_HASH
    ) {
        history.replaceState(null, "", location.pathname + location.search);
        const storedWip = normaliseWip(localStorage.getItem(STORAGE_KEY));
        if (storedWip) {
            setTimeout(() => runDealfileFlow(storedWip), 1200);
        }
    }
})();