// ==UserScript==
// @name         Eden Assistant
// @namespace    eden-assistant
// @version      0.15
// @description  Opens Eden 1 Vue, searches WIP 31583, opens Inspection and selects Green for Air Conditioning Temp
// @match        https://login.eden1vision.com/*
// @match        https://eden.dealfile.co.uk/*
// @updateURL    https://raw.githubusercontent.com/viktor322641/Eden-Assistant/main/Eden-Assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/viktor322641/Eden-Assistant/main/Eden-Assistant.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const WIP_NUMBER = "31583";
    const AUTO_HASH = "#eden-assistant-search-wip";
    const EDEN_VUE_URL =
        "https://eden.dealfile.co.uk/dealcrm_codeweavers/main.asp";

    const sleep = milliseconds =>
        new Promise(resolve => setTimeout(resolve, milliseconds));

    function isVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function setStatus(message, isError = false) {
        console.log("[Eden Assistant]", message);
        const status = document.getElementById("edenAssistantStatus");
        if (!status) return;
        status.textContent = message;
        status.style.background = isError ? "#b71c1c" : "#263238";
    }

    async function waitForElement(finder, timeoutMilliseconds = 15000) {
        const started = Date.now();
        while (Date.now() - started < timeoutMilliseconds) {
            const element = finder();
            if (element) return element;
            await sleep(400);
        }
        return null;
    }

    function setInputValue(input, value) {
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
        )?.set;

        if (setter) setter.call(input, value);
        else input.value = value;

        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    }

    async function openEdenVue() {
        setStatus("Opening Eden 1 Vue on Dealfile...");
        window.location.assign(EDEN_VUE_URL + AUTO_HASH);
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

    async function openInspection() {
        setStatus("Waiting for Inspection tab...");

        const inspectionTab = await waitForElement(() => {
            const element =
                document.getElementById("vhctab_inpection") ||
                document.querySelector('a[href="#vhcinspection"]');
            return isVisible(element) ? element : null;
        }, 20000);

        if (!inspectionTab) {
            setStatus("Inspection tab not found", true);
            return false;
        }

        inspectionTab.style.outline = "4px solid #00bcd4";
        inspectionTab.style.outlineOffset = "3px";
        setStatus("Opening Inspection...");

        if (window.jQuery && typeof window.jQuery(inspectionTab).tab === "function") {
            window.jQuery(inspectionTab).tab("show");
        } else {
            inspectionTab.click();
        }

        const inspectionPane = await waitForElement(() => {
            const pane = document.getElementById("vhcinspection");
            return isVisible(pane) ? pane : null;
        }, 10000);

        if (!inspectionPane) {
            setStatus("Inspection click sent, but pane did not open", true);
            return false;
        }

        setStatus("Inspection opened");
        return true;
    }

    async function selectAirConditioningGreen() {
        setStatus("Looking for Air Conditioning Temp...");

        const row = await waitForElement(() => {
            const element = document.querySelector(
                '#vhcinspection .servline_vhc[job="Air Conditioning Temp"]'
            );
            return isVisible(element) ? element : null;
        }, 10000);

        if (!row) {
            setStatus("Air Conditioning Temp row not found", true);
            return false;
        }

        const greenButton = await waitForElement(() => {
            const element = row.querySelector(
                ".vhcbtn.btn-success, .vhcbtn[class*='_green']"
            );
            return isVisible(element) ? element : null;
        }, 5000);

        if (!greenButton) {
            setStatus("Green button in Air Conditioning Temp not found", true);
            return false;
        }

        row.style.outline = "3px solid #7e57c2";
        row.style.outlineOffset = "2px";
        greenButton.style.outline = "4px solid #00e676";
        greenButton.style.outlineOffset = "3px";

        setStatus("Selecting Green for Air Conditioning Temp...");
        triggerClick(greenButton);
        await sleep(1000);
        setStatus("Green selected for Air Conditioning Temp");
        return true;
    }

    async function enterWipSearchOpenInspectionAndSelectGreen() {
        setStatus("Looking for WIP field...");

        const input = await waitForElement(() => {
            const element = document.getElementById("x_searchwip");
            return isVisible(element) ? element : null;
        });

        if (!input) {
            setStatus("WIP field #x_searchwip not found", true);
            return;
        }

        input.focus();
        setInputValue(input, WIP_NUMBER);
        input.style.outline = "4px solid #ffeb3b";
        input.style.outlineOffset = "3px";
        input.style.background = "#fff59d";

        await sleep(500);

        const searchButton = await waitForElement(() => {
            const element = document.getElementById("mainsearchbuts_serv");
            return isVisible(element) ? element : null;
        }, 10000);

        if (!searchButton) {
            setStatus("Exact Search control #mainsearchbuts_serv not found", true);
            return;
        }

        searchButton.style.outline = "4px solid #4caf50";
        searchButton.style.outlineOffset = "3px";

        setStatus(`Searching WIP ${WIP_NUMBER}...`);
        triggerClick(searchButton);

        const opened = await openInspection();
        if (!opened) return;

        await selectAirConditioningGreen();
    }

    async function runAssistant() {
        const button = document.getElementById("edenAssistantButton");
        if (button) {
            button.disabled = true;
            button.textContent = "WORKING...";
        }

        try {
            if (location.hostname === "login.eden1vision.com") {
                await openEdenVue();
            } else if (location.hostname === "eden.dealfile.co.uk") {
                await enterWipSearchOpenInspectionAndSelectGreen();
            } else {
                setStatus("Unsupported page", true);
            }
        } catch (error) {
            console.error(error);
            setStatus(`Error: ${error.message || error}`, true);
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent =
                    location.hostname === "login.eden1vision.com"
                        ? "OPEN EDEN 1 VUE"
                        : `TEST GREEN WIP ${WIP_NUMBER}`;
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
            alignItems: "flex-end",
            gap: "8px"
        });

        const status = document.createElement("div");
        status.id = "edenAssistantStatus";
        status.textContent = "v0.15 ready";
        Object.assign(status.style, {
            maxWidth: "300px",
            padding: "9px 12px",
            borderRadius: "9px",
            background: "#263238",
            color: "#fff",
            fontSize: "13px",
            boxShadow: "0 3px 10px rgba(0,0,0,.45)"
        });

        const button = document.createElement("button");
        button.id = "edenAssistantButton";
        button.textContent =
            location.hostname === "login.eden1vision.com"
                ? "OPEN EDEN 1 VUE"
                : `TEST GREEN WIP ${WIP_NUMBER}`;
        Object.assign(button.style, {
            padding: "14px 17px",
            border: "2px solid white",
            borderRadius: "12px",
            background: "#1565c0",
            color: "#fff",
            fontSize: "15px",
            fontWeight: "bold",
            boxShadow: "0 3px 10px rgba(0,0,0,.45)"
        });

        button.addEventListener("click", runAssistant);
        panel.appendChild(status);
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
        setTimeout(enterWipSearchOpenInspectionAndSelectGreen, 1200);
    }
})();