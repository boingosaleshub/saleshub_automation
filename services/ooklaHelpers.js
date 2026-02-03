/**
 * Ookla Cell Analytics Shared Helper Functions
 * 
 * This module contains shared utility functions for Ookla automation.
 * Used by both Coverage Plot and ROM automation services.
 */

const { chromium } = require('playwright');

// ============== TIMING UTILITIES ==============

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanWait(page, baseMs) {
    const variation = baseMs * (0.1 + Math.random() * 0.2);
    const actualDelay = Math.floor(baseMs + (Math.random() > 0.5 ? variation : -variation * 0.3));
    await page.waitForTimeout(Math.max(actualDelay, 80));
}

async function shortWait(page) {
    await page.waitForTimeout(randomDelay(200, 400));
}

async function mediumWait(page) {
    await page.waitForTimeout(randomDelay(500, 900));
}

async function longWait(page) {
    await page.waitForTimeout(randomDelay(1200, 2000));
}

// ============== INTERACTION UTILITIES ==============

async function humanTypeLocator(locator, text, page) {
    await locator.click();
    await page.waitForTimeout(randomDelay(80, 150));
    for (const char of text) {
        await locator.type(char, { delay: 0 });
        await page.waitForTimeout(randomDelay(30, 70));
    }
}

async function humanClick(page, locator) {
    const box = await locator.boundingBox();
    if (box) {
        const targetX = box.x + box.width / 2 + randomDelay(-5, 5);
        const targetY = box.y + box.height / 2 + randomDelay(-3, 3);
        await page.mouse.move(targetX, targetY, { steps: randomDelay(2, 3) });
        await page.waitForTimeout(randomDelay(30, 80));
    }
    await locator.click();
}

// ============== BROWSER SETUP ==============

async function createBrowserContext() {
    const browser = await chromium.launch({
        headless: true,
        slowMo: 50,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        ignoreHTTPSErrors: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'America/New_York',
        geolocation: { longitude: -73.935242, latitude: 40.730610 },
        permissions: ['geolocation'],
    });

    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        window.chrome = { runtime: {} };
    });

    const page = await context.newPage();
    return { browser, context, page };
}

// ============== OOKLA LOGIN ==============

async function loginToOokla(page) {
    console.log('  Navigating to login page...');
    await page.goto('https://cellanalytics.ookla.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 45000,
    });

    await page.waitForSelector('input[name="username"]', { timeout: 10000 });
    await humanWait(page, 800);

    console.log('  Filling credentials...');
    const usernameInput = page.locator('input[name="username"]');
    const passwordInput = page.locator('input[name="password"]');

    await humanClick(page, usernameInput);
    await shortWait(page);
    await humanTypeLocator(usernameInput, process.env.OOKLA_USERNAME || 'zjanparian', page);
    await humanWait(page, 500);

    await humanClick(page, passwordInput);
    await shortWait(page);
    await humanTypeLocator(passwordInput, process.env.OOKLA_PASSWORD || 'MmaSBn5xDvUamMdL8QKg4HFd7', page);
    await humanWait(page, 600);

    console.log('  Submitting login...');
    const submitButton = page.locator('input[type="submit"], button[type="submit"]');
    await humanClick(page, submitButton);

    try {
        await page.waitForURL('**/cellanalytics.ookla.com/**', { timeout: 30000 });
        console.log('  ✓ Redirected to dashboard');
    } catch (error) {
        console.log('  Navigation wait timeout, checking URL...');
    }

    await longWait(page);

    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
        throw new Error('Login failed - still on login page');
    }

    console.log('  ✓ Login successful!');
    return true;
}

// ============== DAY VIEW SELECTION ==============

async function selectDayView(page) {
    console.log('  Changing to Day view...');
    try {
        const layersToggle = page.locator('a.leaflet-control-layers-toggle[title="Layers"]');
        await layersToggle.waitFor({ state: 'attached', timeout: 8000 });
        await layersToggle.hover();
        const dayRadioInput = page.locator('input[type="radio"].leaflet-control-layers-selector[name="leaflet-base-layers"]').nth(3);
        await dayRadioInput.click({ force: true, timeout: 2000 });
        console.log('  ✓ Day view selected');
        await page.mouse.move(100, 100);
    } catch (error) {
        console.log('  Day view switch error, trying alternatives...');
        try {
            await page.evaluate(() => {
                const radios = document.querySelectorAll('input[type="radio"].leaflet-control-layers-selector');
                if (radios[3]) radios[3].click();
            });
            console.log('  ✓ Day view selected (via evaluate)');
        } catch (e) {
            console.log('  Note: Could not change to Day view');
        }
    }
}

// ============== ADDRESS ENTRY ==============

async function enterAddress(page, address) {
    console.log('  Entering address:', address);

    let addressInput = null;
    const allTextInputs = await page.locator('input[type="text"]').all();
    console.log(`  Found ${allTextInputs.length} text inputs on page`);

    for (let i = 0; i < allTextInputs.length; i++) {
        const input = allTextInputs[i];
        const isVisible = await input.isVisible().catch(() => false);
        const isReadonly = await input.getAttribute('readonly').catch(() => null);

        if (isVisible && !isReadonly) {
            addressInput = input;
            console.log(`  Found address input at index ${i} (not readonly)`);
            break;
        }
    }

    if (!addressInput) {
        addressInput = page.locator('input[type="text"]:not([readonly])').first();
        console.log('  Using fallback selector: input[type="text"]:not([readonly])');
    }

    await addressInput.waitFor({ state: 'visible', timeout: 15000 });

    try {
        await addressInput.fill('');
        await page.waitForTimeout(300);
    } catch (e) {
        console.log('  Could not clear with fill, trying triple-click');
        await addressInput.click({ clickCount: 3 });
        await page.waitForTimeout(300);
        await addressInput.press('Backspace');
        await page.waitForTimeout(200);
    }

    await humanTypeLocator(addressInput, address, page);
    console.log('  ✓ Address entered');
    await mediumWait(page);

    await addressInput.press('Enter');
    console.log('  ✓ Enter pressed');
    await longWait(page);
    await longWait(page);
}

// ============== NETWORK PROVIDER ==============

async function openNetworkProvider(page) {
    console.log('  Opening Network Provider...');

    let networkProviderOpened = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`  Attempt ${attempt}/3...`);
                await page.waitForTimeout(2000);
            }

            const toggle1 = page.locator('text=Network Provider').locator('..').locator('span').first();
            if (await toggle1.count() > 0) {
                await toggle1.click({ force: true, timeout: 10000 });
                networkProviderOpened = true;
                console.log('  ✓ Network Provider section opened (method 1)');
                break;
            }
        } catch (e1) {
            console.log(`  Method 1 failed: ${e1.message}`);

            try {
                const toggle2 = page.locator('text=Network Provider').locator('..');
                if (await toggle2.count() > 0) {
                    await toggle2.click({ force: true, timeout: 10000 });
                    networkProviderOpened = true;
                    console.log('  ✓ Network Provider section opened (method 2)');
                    break;
                }
            } catch (e2) {
                console.log(`  Method 2 failed: ${e2.message}`);

                try {
                    const result = await page.evaluate(() => {
                        const elements = document.querySelectorAll('*');
                        for (const el of elements) {
                            if (el.textContent && el.textContent.includes('Network Provider')) {
                                const toggle = el.querySelector('.v-treetable-treespacer, .v-treetable-node-closed, span');
                                if (toggle) {
                                    toggle.click();
                                    return { success: true, method: 'evaluate-toggle' };
                                }
                                el.click();
                                return { success: true, method: 'evaluate-element' };
                            }
                        }
                        return { success: false };
                    });

                    if (result.success) {
                        networkProviderOpened = true;
                        console.log(`  ✓ Network Provider section opened (${result.method})`);
                        break;
                    }
                } catch (e3) {
                    console.log(`  Method 3 failed: ${e3.message}`);
                }
            }
        }
    }

    if (!networkProviderOpened) {
        throw new Error('Could not open Network Provider section after 3 attempts');
    }

    await longWait(page);
}

// ============== CARRIER SELECTION ==============

async function configureCarriers(page, carriersToSelect) {
    console.log('  Configuring carriers...');
    const allCarriers = { 'AT&T': 'AT&T US', 'Verizon': 'Verizon', 'T-Mobile': 'T-Mobile US' };

    for (const [userName, siteName] of Object.entries(allCarriers)) {
        try {
            let found = false;

            const carrierLabel = page.locator(`label:has-text("${siteName}")`).first();
            if (await carrierLabel.count() > 0) {
                await carrierLabel.waitFor({ state: 'visible', timeout: 3000 }).catch(() => { });
                if (await carrierLabel.isVisible().catch(() => false)) {
                    const carrierLabelFor = await carrierLabel.getAttribute('for');
                    if (carrierLabelFor) {
                        const carrierCheckbox = page.locator(`#${carrierLabelFor}`);
                        const isChecked = await carrierCheckbox.isChecked().catch(() => false);
                        const shouldBeChecked = carriersToSelect.includes(userName);

                        if (isChecked !== shouldBeChecked) {
                            await carrierLabel.click({ force: true });
                            console.log(`  ${shouldBeChecked ? '✓ Checked' : '✗ Unchecked'} ${siteName}`);
                            await shortWait(page);
                        } else {
                            console.log(`  ${siteName} already ${isChecked ? 'checked' : 'unchecked'}`);
                        }
                        found = true;
                    }
                }
            }

            if (!found) {
                const shouldBeChecked = carriersToSelect.includes(userName);
                const result = await page.evaluate(({ siteName, shouldCheck }) => {
                    const labels = document.querySelectorAll('label');
                    for (const label of labels) {
                        if (label.textContent && label.textContent.includes(siteName.split(' ')[0])) {
                            const forId = label.getAttribute('for');
                            if (forId) {
                                const checkbox = document.getElementById(forId);
                                if (checkbox) {
                                    const isChecked = checkbox.checked;
                                    if (isChecked !== shouldCheck) {
                                        label.click();
                                        return { clicked: true, action: shouldCheck ? 'checked' : 'unchecked' };
                                    }
                                    return { clicked: false, already: isChecked ? 'checked' : 'unchecked' };
                                }
                            }
                        }
                    }
                    return { error: 'not found' };
                }, { siteName, shouldCheck: shouldBeChecked });

                if (result.clicked) {
                    console.log(`  ✓ ${result.action} ${siteName} (via evaluate)`);
                    await shortWait(page);
                } else if (result.already) {
                    console.log(`  ${siteName} already ${result.already}`);
                } else {
                    console.log(`  Warning: Could not find ${userName}`);
                }
            }
        } catch (error) {
            console.log(`  Warning: Could not configure ${userName}: ${error.message}`);
        }
    }
    await mediumWait(page);
}

// ============== LTE SECTION ==============

async function openLTESection(page) {
    console.log('  Opening LTE options...');

    let lteOpened = false;

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`  Attempt ${attempt}/3...`);
                await page.waitForTimeout(2000);
            }

            const toggle1 = page.locator('text=LTE').locator('..').locator('span').first();
            if (await toggle1.count() > 0) {
                await toggle1.click({ force: true, timeout: 10000 });
                lteOpened = true;
                console.log('  ✓ LTE section opened (method 1)');
                break;
            }
        } catch (e1) {
            console.log(`  Method 1 failed: ${e1.message}`);

            try {
                const toggle2 = page.locator('text=LTE').locator('..');
                if (await toggle2.count() > 0) {
                    await toggle2.click({ force: true, timeout: 10000 });
                    lteOpened = true;
                    console.log('  ✓ LTE section opened (method 2)');
                    break;
                }
            } catch (e2) {
                console.log(`  Method 2 failed: ${e2.message}`);

                try {
                    const result = await page.evaluate(() => {
                        const elements = document.querySelectorAll('*');
                        for (const el of elements) {
                            if (el.textContent && el.textContent.trim() === 'LTE') {
                                const toggle = el.querySelector('.v-treetable-treespacer, .v-treetable-node-closed, span');
                                if (toggle) {
                                    toggle.click();
                                    return { success: true };
                                }
                                el.click();
                                return { success: true };
                            }
                        }
                        return { success: false };
                    });

                    if (result.success) {
                        lteOpened = true;
                        console.log('  ✓ LTE section opened (evaluate)');
                        break;
                    }
                } catch (e3) {
                    console.log(`  Method 3 failed: ${e3.message}`);
                }
            }
        }
    }

    if (!lteOpened) {
        throw new Error('Could not open LTE section after 3 attempts');
    }

    await longWait(page);
}

// ============== RSRP SELECTION ==============

async function selectRSRP(page) {
    console.log('  Selecting RSRP...');
    try {
        const rsrpRow = page.locator('tr').filter({ has: page.locator('span.v-captiontext:has-text("RSRP")') });
        const rsrpCheckbox = rsrpRow.locator('input[type="checkbox"]').first();
        await rsrpCheckbox.waitFor({ state: 'attached', timeout: 15000 });
        if (!(await rsrpCheckbox.isChecked())) {
            await rsrpCheckbox.check({ force: true });
            console.log('  ✓ RSRP checkbox selected');
            await page.keyboard.press('Escape').catch(() => { });
            await page.waitForTimeout(300);
        }
        await mediumWait(page);

        // Uncheck other LTE metrics
        const lteRows = page.locator('tr').filter({ has: page.locator('span.v-captiontext:text-matches("RSRQ|SNR|CQI", "i")') });
        const rowCount = await lteRows.count();
        for (let i = 0; i < rowCount; i++) {
            const row = lteRows.nth(i);
            const checkbox = row.locator('input[type="checkbox"]').first();
            try {
                if (await checkbox.isChecked()) {
                    await checkbox.uncheck({ force: true });
                    await shortWait(page);
                }
            } catch (e) { }
        }
    } catch (error) {
        console.log('  Error with RSRP selection:', error.message);
    }
    await mediumWait(page);
}

// ============== VIEW SELECTION ==============

async function selectView(page, viewName) {
    console.log(`  Selecting ${viewName}...`);

    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`    Attempt ${attempt}/3...`);
                await page.waitForTimeout(2000);
                await page.keyboard.press('Escape').catch(() => { });
                await page.waitForTimeout(500);
            }

            await page.waitForTimeout(1000);

            const allDropdowns = await page.locator('input.v-filterselect-input.v-filterselect-input-readonly').all();
            console.log(`    Found ${allDropdowns.length} readonly dropdowns on page`);

            let viewDropdownFound = false;

            for (let i = 0; i < allDropdowns.length; i++) {
                const dropdown = allDropdowns[i];

                try {
                    await dropdown.scrollIntoViewIfNeeded().catch(() => { });
                    await page.waitForTimeout(300);

                    const isVisible = await dropdown.isVisible().catch(() => false);
                    if (!isVisible) {
                        console.log(`    Dropdown ${i}: not visible, skipping`);
                        continue;
                    }

                    let optionListOpened = false;

                    try {
                        const parent = await dropdown.locator('..').first();
                        const button = await parent.locator('.v-filterselect-button, div[class*="button"]').first();
                        if (await button.count() > 0) {
                            await button.click({ force: true, timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                    } catch (e) { }

                    optionListOpened = await page.locator('#VAADIN_COMBOBOX_OPTIONLIST').isVisible().catch(() => false);

                    if (!optionListOpened) {
                        await dropdown.click({ force: true, timeout: 5000 });
                        await page.waitForTimeout(1000);
                        optionListOpened = await page.locator('#VAADIN_COMBOBOX_OPTIONLIST').isVisible().catch(() => false);
                    }

                    if (!optionListOpened) {
                        await page.evaluate((idx) => {
                            const inputs = document.querySelectorAll('input.v-filterselect-input.v-filterselect-input-readonly');
                            if (inputs[idx]) {
                                inputs[idx].click();
                            }
                        }, i);
                        await page.waitForTimeout(1000);
                        optionListOpened = await page.locator('#VAADIN_COMBOBOX_OPTIONLIST').isVisible().catch(() => false);
                    }

                    if (!optionListOpened) {
                        optionListOpened = await page.waitForSelector('#VAADIN_COMBOBOX_OPTIONLIST', {
                            state: 'visible',
                            timeout: 5000
                        }).then(() => true).catch(() => false);
                    }

                    if (!optionListOpened) {
                        console.log(`    Dropdown ${i}: no option list appeared after all methods`);
                        continue;
                    }

                    await page.waitForTimeout(500);

                    const options = await page.locator('#VAADIN_COMBOBOX_OPTIONLIST span').allTextContents();
                    console.log(`    Dropdown ${i} options: ${JSON.stringify(options.slice(0, 5))}...`);

                    const isViewDropdown = options.some(opt =>
                        opt.includes('View') ||
                        opt.includes('Indoor') ||
                        opt.includes('Outdoor')
                    );

                    if (isViewDropdown) {
                        console.log(`    ✓ Found VIEW dropdown at index ${i}`);
                        viewDropdownFound = true;
                        break;
                    } else {
                        console.log(`    Dropdown ${i}: not view dropdown`);
                        await page.keyboard.press('Escape').catch(() => { });
                        await page.waitForTimeout(300);
                    }
                } catch (e) {
                    console.log(`    Dropdown ${i}: error - ${e.message}`);
                    await page.keyboard.press('Escape').catch(() => { });
                }
            }

            if (!viewDropdownFound) {
                throw new Error('Could not find VIEW dropdown');
            }

            await page.waitForTimeout(500);

            let option = null;

            option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST td span:has-text("${viewName}")`).first();
            if (await option.count() === 0) {
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST td:has(span:has-text("${viewName}"))`).first();
            }
            if (await option.count() === 0) {
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST span`).filter({ hasText: new RegExp(viewName, 'i') }).first();
            }
            if (await option.count() === 0) {
                const partialName = viewName.split(' ')[0];
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST span`).filter({ hasText: new RegExp(partialName, 'i') }).first();
            }

            if (await option.count() === 0) {
                throw new Error(`Could not find option "${viewName}" in dropdown`);
            }

            await option.waitFor({ state: 'visible', timeout: 5000 });

            const tagName = await option.evaluate(el => el.tagName.toLowerCase());
            if (tagName === 'span') {
                const parentTd = option.locator('..');
                await parentTd.click({ force: true });
            } else {
                await option.click({ force: true });
            }

            console.log(`    ✓ ${viewName} selected`);

            await page.waitForTimeout(2000);
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
            await page.waitForTimeout(1000);

            return true;

        } catch (error) {
            console.log(`    Attempt ${attempt} failed: ${error.message}`);

            try {
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
            } catch (e) { }

            if (attempt === 3) {
                console.error(`    ✗ Failed to select ${viewName} after 3 attempts`);
                return false;
            }
        }
    }

    return false;
}

// ============== SCREENSHOT UTILITIES ==============

async function closeOpenPopups(page) {
    console.log('  Closing any open dialogs...');
    try {
        const removed = await page.evaluate(() => {
            let removedCount = 0;
            const windows = document.querySelectorAll('.v-window, .v-window-wrap, .v-window-contents');
            windows.forEach(w => {
                w.remove();
                removedCount++;
            });
            const overlays = document.querySelectorAll('.v-window-modalitycurtain');
            overlays.forEach(o => {
                o.remove();
                removedCount++;
            });
            return removedCount;
        });

        if (removed > 0) {
            console.log(`    ✓ Removed ${removed} dialog elements`);
        }
    } catch (e) {
        console.log('    Note: Error removing dialogs:', e.message);
    }
    await page.waitForTimeout(500);
    console.log('    ✓ Page settled');
}

async function zoomIn(page, clicks = 4) {
    console.log('  Zooming in...');
    try {
        console.log('    Finding zoom button...');
        let zoomButton = null;

        try {
            const containers = page.locator('.v-splitpanel-second-container');
            if (await containers.count() > 0) {
                const mapContainer = containers.first();
                const buttons = mapContainer.locator('.v-button');
                const count = await buttons.count();

                for (let i = 0; i < count; i++) {
                    const btn = buttons.nth(i);
                    const icon = btn.locator('.v-icon.FontAwesome');
                    if (await icon.count() > 0) {
                        zoomButton = btn;
                        console.log('    ✓ Found zoom button via container query');
                        break;
                    }
                }
            }
        } catch (e) {
            console.log('    Error searching container:', e.message);
        }

        if (!zoomButton) {
            console.log('    Fallback: Searching globally for plus icon...');
            const potentialButtons = page.locator('.v-button .v-icon.FontAwesome');
            const count = await potentialButtons.count();
            for (let i = 0; i < count; i++) {
                const icon = potentialButtons.nth(i);
                const className = await icon.getAttribute('class') || '';
                if (className.includes('FontAwesome')) {
                    zoomButton = icon.locator('..').locator('..');
                    break;
                }
            }
        }

        if (!zoomButton) {
            throw new Error('Zoom button not found');
        }

        await zoomButton.waitFor({ state: 'visible', timeout: 5000 });

        console.log(`    Clicking zoom button ${clicks} times...`);
        for (let i = 1; i <= clicks; i++) {
            await zoomButton.click({ force: true });
            console.log(`      Click ${i}/${clicks}`);
            await page.waitForTimeout(1000);
        }
        console.log(`    ✓ Zoomed in ${clicks}x successfully`);

    } catch (e) {
        console.log(`    Warning: Could not zoom: ${e.message}`);
        console.log('    (Skipping zoom, hoping default view is okay)');
    }
}

async function collapseSidebar(page) {
    console.log('  Collapsing sidebar...');
    try {
        const collapseButton = page.locator('div.v-absolutelayout-wrapper-expand-component div.v-button.v-widget').first();
        await collapseButton.waitFor({ state: 'visible', timeout: 10000 });
        await collapseButton.click({ force: true });
        await page.waitForTimeout(800);
        console.log('    ✓ Sidebar collapsed');
        return true;
    } catch (e) {
        console.log('    Warning: Could not collapse sidebar');
        return false;
    }
}

async function expandSidebar(page) {
    try {
        const expandButton = page.locator('div.v-absolutelayout-wrapper-expand-component div.v-button.v-widget').first();
        if (await expandButton.count() > 0) {
            await expandButton.click({ force: true });
            await page.waitForTimeout(800);
            console.log('    ✓ Sidebar expanded');
        }
    } catch (e) {
        console.log('    Note: Could not expand sidebar');
    }
}

async function takeScreenshot(page, viewType, sanitizedAddress, timestamp) {
    console.log(`  Taking ${viewType} screenshot...`);
    try {
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
            console.log('    - Network not idle after 10s, proceeding anyway...');
        });

        await page.waitForTimeout(1000);

        console.log('    Taking full page screenshot...');
        const buffer = await page.screenshot({
            type: 'png',
            fullPage: false,
            timeout: 45000
        });

        const sizeKB = (buffer.length / 1024).toFixed(2);
        console.log(`    ✓ Screenshot captured: ${sizeKB} KB`);

        return {
            filename: `${viewType}_${sanitizedAddress}_${timestamp}.png`,
            buffer: buffer.toString('base64'),
            size: sizeKB
        };

    } catch (error) {
        console.error(`    ✗ Screenshot failed: ${error.message}`);
        throw error;
    }
}

// ============== EXPORTS ==============

module.exports = {
    // Timing utilities
    randomDelay,
    humanWait,
    shortWait,
    mediumWait,
    longWait,
    
    // Interaction utilities
    humanTypeLocator,
    humanClick,
    
    // Browser setup
    createBrowserContext,
    
    // Ookla operations
    loginToOokla,
    selectDayView,
    enterAddress,
    openNetworkProvider,
    configureCarriers,
    openLTESection,
    selectRSRP,
    selectView,
    
    // Screenshot utilities
    closeOpenPopups,
    zoomIn,
    collapseSidebar,
    expandSidebar,
    takeScreenshot
};
