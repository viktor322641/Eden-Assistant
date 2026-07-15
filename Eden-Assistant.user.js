// ==UserScript==
// @name         Eden Assistant
// @namespace    eden-assistant
// @version      0.20
// @description  Opens Eden 1 Vue, searches WIP 31583 and opens Inspection without changing VHC data
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

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
        const stringValue = String(value);
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

    async function openEdenVue() {
        setStatus("Opening Eden 1 Vue...");
        window.location.assign(EDEN_VUE_URL + AUTO_HASH);
    }

    async function openTab(tabId, paneId, href) {
        const tab = await waitForElement(() => {
            const element =
                document.getElementById(tabId) ||
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
            tab.click();
        }

        const pane = await waitForElement(() => {
            const element = document.getElementById(paneId);
            return isVisible(element) ? element : null;
        }, 10000);

        if (!pane) {
            setStatus(`${paneId} did not open`, true);
            return false;
        }

        await sleep(500);
        return true;
    }

    // Prepared for later versions. Not called by v0.20.
    async function setAllInspectionDescriptions(description) {
        const fields = Array.from(document.querySelectorAll(
            "#vhcinspection input.vhcjobdesc, " +
            "#vhcinspection input[id^='vhcjobdesc_']"
        )).filter(isVisible);

        for (const field of fields) {
            field.focus();
            setInputValue(field, description);
            await sleep(100);
            commitInput(field);
            await sleep(350);
        }

        return fields.length;
    }

    // Prepared for later versions. Not called by v0.20.
    async function setTyre(side, data) {
        const allowedSides = ["fl", "fr", "rl", "rr", "spare"];
        if (!allowedSides.includes(side)) {
            throw new Error(`Unsupported tyre side: ${side}`);
        }

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
            await sleep(150);
            commitInput(element);
            await sleep(700);
        }

        return true;
    }

    async function runDealfileFlow() {
        setStatus("Looking for WIP field...");

        const input = await waitForElement(() => {
            const element = document.getElementById("x_searchwip");
            return isVisible(element) ? element : null;
        });

        if (!input) {
            setStatus("WIP field not found", true);
            return;
        }

        input.focus();
        setInputValue(input, WIP_NUMBER);
        await sleep(500);

        const searchButton = await waitForElement(() => {
            const element = document.getElementById("mainsearchbuts_serv");
            return isVisible(element) ? element : null;
        }, 10000);

        if (!searchButton) {
            setStatus("Search control not found", true);
            return;
        }

        setStatus(`Searching WIP ${WIP_NUMBER}...`);
        triggerClick(searchButton);

        const inspectionOpened = await openTab(
            "vhctab_inpection",
            "vhcinspection",
            "#vhcinspection"
        );

        if (!inspectionOpened) return;
        setStatus(`WIP ${WIP_NUMBER}: Inspection opened`);
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
                await runDealfileFlow();
            } else {
                setStatus("Unsupported page", true);
            }
        } catch (error) {
            console.error(error);
            setStatus(`Error: ${error.message || error}`, true);
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = "EDEN ASSISTANT";
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
        status.textContent = "v0.20 ready";
        Object.assign(status.style, {
            maxWidth: "320px",
            padding: "9px 12px",
            borderRadius: "9px",
            background: "#263238",
            color: "#fff",
            fontSize: "13px",
            boxShadow: "0 3px 10px rgba(0,0,0,.45)"
        });

        const button = document.createElement("button");
        button.id = "edenAssistantButton";
        button.textContent = "EDEN ASSISTANT";
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
        setTimeout(runDealfileFlow, 1200);
    }
})();