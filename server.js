require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

// Import Routes
const romRoutes = require('./routes/romRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// ============== CORS CONFIGURATION ==============
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============== UTILITY ENDPOINTS ==============

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.json({
        service: 'Boingo Playwright Automation',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: 'GET /health',
            coveragePlot: {
                automate: 'POST /api/automate',
                automateStream: 'POST /api/automate/stream'
            },
            romGenerator: {
                automate: 'POST /api/rom/automate',
                automateStream: 'POST /api/rom/automate/stream',
                health: 'GET /api/rom/health'
            }
        }
    });
});

// ============== ROM AUTOMATION ROUTES ==============
// ROM Generator automation - separate from Coverage Plot
app.use('/api/rom', romRoutes);

// ============== HELPER FUNCTIONS ==============

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function humanWait(page, baseMs) {
    const variation = baseMs * (0.1 + Math.random() * 0.2);
    const actualDelay = Math.floor(baseMs + (Math.random() > 0.5 ? variation : -variation * 0.3));
    await page.waitForTimeout(Math.max(actualDelay, 80));
}

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

async function shortWait(page) {
    await page.waitForTimeout(randomDelay(200, 400));
}

async function mediumWait(page) {
    await page.waitForTimeout(randomDelay(500, 900));
}

async function longWait(page) {
    await page.waitForTimeout(randomDelay(1200, 2000));
}

// ============== SCREENSHOT HELPER FUNCTIONS ==============

async function selectView(page, viewName) {
    console.log(`  Selecting ${viewName}...`);

    // Helper: check if the option list popup is visible (try multiple selectors)
    async function isOptionListVisible() {
        const selectors = [
            '#VAADIN_COMBOBOX_OPTIONLIST',
            '.v-filterselect-suggestpopup',
            'div[class*="suggestpopup"]'
        ];
        for (const sel of selectors) {
            const visible = await page.locator(sel).isVisible().catch(() => false);
            if (visible) return true;
        }
        return false;
    }

    // Helper: try all methods to open a specific dropdown by index
    async function tryOpenDropdown(dropdownInput, idx) {
        // Method 1: Click the .v-filterselect-button sibling via parent wrapper
        try {
            const button = dropdownInput.locator('xpath=../div[contains(@class,"v-filterselect-button")]').first();
            if (await button.count() > 0) {
                await button.click({ force: true, timeout: 3000 });
                await page.waitForTimeout(800);
                if (await isOptionListVisible()) return true;
            }
        } catch (e) { }

        // Method 2: Click the input directly
        try {
            await dropdownInput.click({ force: true, timeout: 3000 });
            await page.waitForTimeout(800);
            if (await isOptionListVisible()) return true;
        } catch (e) { }

        // Method 3: Focus input then press ArrowDown to open dropdown
        try {
            await dropdownInput.focus({ timeout: 3000 });
            await page.waitForTimeout(300);
            await page.keyboard.press('ArrowDown');
            await page.waitForTimeout(800);
            if (await isOptionListVisible()) return true;
        } catch (e) { }

        // Method 4: Dispatch full mousedown/mouseup/click sequence on the button via evaluate
        try {
            const opened = await page.evaluate((index) => {
                const inputs = document.querySelectorAll('input.v-filterselect-input.v-filterselect-input-readonly');
                const input = inputs[index];
                if (!input) return false;

                // Find the button sibling
                const wrapper = input.closest('.v-filterselect') || input.parentElement;
                const btn = wrapper ? wrapper.querySelector('.v-filterselect-button') || wrapper.querySelector('div[class*="button"]') : null;
                const target = btn || input;

                // Dispatch full mouse event sequence
                const rect = target.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const eventOpts = { bubbles: true, cancelable: true, clientX: cx, clientY: cy, button: 0 };

                target.dispatchEvent(new MouseEvent('mousedown', eventOpts));
                target.dispatchEvent(new MouseEvent('mouseup', eventOpts));
                target.dispatchEvent(new MouseEvent('click', eventOpts));
                return true;
            }, idx);

            if (opened) {
                await page.waitForTimeout(1000);
                if (await isOptionListVisible()) return true;
            }
        } catch (e) { }

        // Method 5: Click the parent .v-filterselect wrapper itself
        try {
            const wrapper = dropdownInput.locator('xpath=ancestor::div[contains(@class,"v-filterselect")]').first();
            if (await wrapper.count() > 0) {
                await wrapper.click({ force: true, timeout: 3000 });
                await page.waitForTimeout(800);
                if (await isOptionListVisible()) return true;
            }
        } catch (e) { }

        // Method 6: Double-click the input (some Vaadin versions respond to dblclick)
        try {
            await dropdownInput.dblclick({ force: true, timeout: 3000 });
            await page.waitForTimeout(800);
            if (await isOptionListVisible()) return true;
        } catch (e) { }

        // Method 7: Wait longer for any delayed popup
        try {
            const appeared = await page.waitForSelector('#VAADIN_COMBOBOX_OPTIONLIST, .v-filterselect-suggestpopup', {
                state: 'visible',
                timeout: 3000
            }).then(() => true).catch(() => false);
            if (appeared) return true;
        } catch (e) { }

        return false;
    }

    // Try up to 3 times
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`    Attempt ${attempt}/3...`);
                await page.waitForTimeout(2000);
                await page.keyboard.press('Escape').catch(() => { });
                await page.waitForTimeout(500);
                // Click somewhere neutral to reset focus
                await page.mouse.click(100, 100).catch(() => { });
                await page.waitForTimeout(500);
            }

            await page.waitForTimeout(1000);

            // Step A: Try to identify the VIEW dropdown by its current value first
            const dropdownInfos = await page.evaluate(() => {
                const inputs = document.querySelectorAll('input.v-filterselect-input.v-filterselect-input-readonly');
                return Array.from(inputs).map((input, i) => ({
                    index: i,
                    value: input.value || '',
                    visible: input.offsetParent !== null,
                    parentClasses: (input.parentElement?.className || '')
                }));
            });

            console.log(`    Found ${dropdownInfos.length} readonly dropdowns on page`);
            dropdownInfos.forEach((d, i) => {
                console.log(`    Dropdown ${i}: value="${d.value}", visible=${d.visible}`);
            });

            // Check if any dropdown already shows a view-related value
            const viewKeywords = ['view', 'indoor', 'outdoor', 'day', 'night'];
            let viewDropdownIdx = dropdownInfos.findIndex(d =>
                d.visible && viewKeywords.some(kw => d.value.toLowerCase().includes(kw))
            );

            const allDropdowns = await page.locator('input.v-filterselect-input.v-filterselect-input-readonly').all();
            let viewDropdownFound = false;

            // Step B: If we identified the VIEW dropdown by value, try that one first
            if (viewDropdownIdx >= 0) {
                console.log(`    Likely VIEW dropdown at index ${viewDropdownIdx} (value: "${dropdownInfos[viewDropdownIdx].value}")`);
                const dropdown = allDropdowns[viewDropdownIdx];
                await dropdown.scrollIntoViewIfNeeded().catch(() => { });
                await page.waitForTimeout(300);

                if (await tryOpenDropdown(dropdown, viewDropdownIdx)) {
                    viewDropdownFound = true;
                } else {
                    console.log(`    Could not open likely VIEW dropdown, trying others...`);
                    viewDropdownIdx = -1;
                }
            }

            // Step C: If not found by value, try each dropdown
            if (!viewDropdownFound) {
                for (let i = 0; i < allDropdowns.length; i++) {
                    if (i === viewDropdownIdx) continue; // Already tried this one
                    const dropdown = allDropdowns[i];

                    try {
                        await dropdown.scrollIntoViewIfNeeded().catch(() => { });
                        await page.waitForTimeout(300);

                        const isVisible = await dropdown.isVisible().catch(() => false);
                        if (!isVisible) {
                            console.log(`    Dropdown ${i}: not visible, skipping`);
                            continue;
                        }

                        if (await tryOpenDropdown(dropdown, i)) {
                            await page.waitForTimeout(500);

                            // Read options to verify this is the VIEW dropdown
                            const options = await page.locator('#VAADIN_COMBOBOX_OPTIONLIST span, .v-filterselect-suggestpopup span').allTextContents();
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
                        } else {
                            console.log(`    Dropdown ${i}: no option list appeared after all methods`);
                        }
                    } catch (e) {
                        console.log(`    Dropdown ${i}: error - ${e.message}`);
                        await page.keyboard.press('Escape').catch(() => { });
                    }
                }
            }

            if (!viewDropdownFound) {
                throw new Error('Could not find VIEW dropdown');
            }

            // Dropdown is open - wait for options to stabilize
            await page.waitForTimeout(500);

            // Try multiple ways to find and click the target option
            let option = null;

            option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST td span:has-text("${viewName}")`).first();
            if (await option.count() === 0) {
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST td:has(span:has-text("${viewName}"))`).first();
            }
            if (await option.count() === 0) {
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST span, .v-filterselect-suggestpopup span`).filter({ hasText: new RegExp(viewName.replace(/[&]/g, '.*'), 'i') }).first();
            }
            if (await option.count() === 0) {
                // Try matching with "and" instead of "&" or vice versa
                const altName = viewName.includes('&') ? viewName.replace('&', 'and') : viewName.replace(' and ', ' & ');
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST span, .v-filterselect-suggestpopup span`).filter({ hasText: new RegExp(altName.replace(/[&]/g, '.*'), 'i') }).first();
            }
            if (await option.count() === 0) {
                // Partial match on keywords
                const keywords = viewName.split(/[\s&]+/).filter(w => w.length > 2);
                for (const kw of keywords) {
                    option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST span, .v-filterselect-suggestpopup span`).filter({ hasText: new RegExp(kw, 'i') }).first();
                    if (await option.count() > 0) break;
                }
            }

            if (await option.count() === 0) {
                // Log all available options for debugging
                const allOpts = await page.locator('#VAADIN_COMBOBOX_OPTIONLIST span, .v-filterselect-suggestpopup span').allTextContents();
                console.log(`    Available options: ${JSON.stringify(allOpts)}`);
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

async function takeScreenshot(page, viewType, sanitizedAddress, timestamp) {
    console.log(`  Taking ${viewType} screenshot...`);
    try {
        // Shorter wait - don't let page hang
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
            console.log('    - Network not idle after 10s, proceeding anyway...');
        });

        await page.waitForTimeout(1000); // Reduced from 3s

        // ALWAYS use full page screenshot - element screenshots cause freeze
        console.log('    Taking full page screenshot...');
        const buffer = await page.screenshot({
            type: 'png',
            fullPage: false,
            timeout: 45000 // Increased timeout
        });

        const sizeKB = (buffer.length / 1024).toFixed(2);
        console.log(`    ✓ Screenshot captured: ${sizeKB} KB`);

        return {
            filename: `ookla_${viewType}_${sanitizedAddress}_${timestamp}.png`,
            buffer: buffer.toString('base64'),
            size: sizeKB
        };

    } catch (error) {
        console.error(`    ✗ Screenshot failed: ${error.message}`);
        throw error;
    }
}

// ============== OOKLA AUTOMATION ==============

// Helper to send SSE progress updates
function sendProgress(res, progress, step, status = 'in_progress') {
    const data = JSON.stringify({ progress, step, status });
    res.write(`data: ${data}\n\n`);
}

// SSE endpoint for streaming progress
app.post('/api/automate/stream', async (req, res) => {
    let browser;
    const startTime = Date.now();

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
        const { address, carriers, coverageTypes } = req.body;

        if (!address) {
            sendProgress(res, 0, 'Error: Address is required', 'error');
            res.end();
            return;
        }

        console.log('='.repeat(60));
        console.log('Starting Ookla automation with SSE');
        console.log('Address:', address);
        console.log('Carriers:', carriers);
        console.log('Coverage types:', coverageTypes);
        console.log('='.repeat(60));

        sendProgress(res, 0, 'Initializing browser...');

        browser = await chromium.launch({
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

        // Step 1: Login
        sendProgress(res, 5, 'Navigating to login page...');
        console.log('Step 1: Navigating to login page...');
        await page.goto('https://cellanalytics.ookla.com/login', {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
        });

        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await humanWait(page, 800);

        sendProgress(res, 10, 'Entering credentials...');
        console.log('Step 2: Filling credentials...');
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

        sendProgress(res, 15, 'Logging in...');
        console.log('Step 3: Submitting login...');
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
            await browser.close();
            sendProgress(res, 15, 'Login failed', 'error');
            res.end();
            return;
        }

        console.log('  ✓ Login successful!');
        sendProgress(res, 20, 'Login successful!');

        // Step 4: Day View
        sendProgress(res, 22, 'Changing to day view...');
        console.log('Step 4: Changing to Day view...');
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

        // Step 5: Address
        sendProgress(res, 28, 'Entering address...');
        console.log('Step 5: Entering address:', address);

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

        // Step 6: Network Provider
        sendProgress(res, 38, 'Opening network provider...');
        console.log('Step 6: Opening Network Provider...');

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

        // Step 7: Carriers
        sendProgress(res, 48, 'Configuring carriers...');
        const carriersToSelect = carriers || [];
        const allCarriers = { 'AT&T': 'AT&T US', 'Verizon': 'Verizon', 'T-Mobile': 'T-Mobile US' };

        console.log('Step 7: Configuring carriers...');
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

        // Step 8: LTE
        sendProgress(res, 58, 'Opening LTE options...');
        console.log('Step 8: Opening LTE options...');

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

        // Step 9: RSRP
        sendProgress(res, 68, 'Selecting RSRP...');
        console.log('Step 9: Selecting RSRP...');
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

        // ============== SCREENSHOTS ==============
        sendProgress(res, 75, 'Preparing screenshots...');

        const hasIndoor = coverageTypes?.includes('Indoor');
        const hasOutdoor = coverageTypes?.includes('Outdoor');
        const hasIndoorAndOutdoor = coverageTypes?.includes('Indoor & Outdoor');

        const screenshots = [];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedAddress = address.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

        async function closeOpenPopups() {
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

        async function prepareForScreenshot() {
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

                console.log('    Clicking zoom button 4 times...');
                for (let i = 1; i <= 4; i++) {
                    await zoomButton.click({ force: true });
                    console.log(`      Click ${i}/4`);
                    await page.waitForTimeout(1000);
                }
                console.log('    ✓ Zoomed in 4x successfully');

            } catch (e) {
                console.log(`    Warning: Could not zoom: ${e.message}`);
                console.log('    (Skipping zoom, hoping default view is okay)');
            }

            console.log('  Collapsing sidebar...');
            try {
                const collapseButton = page.locator('div.v-absolutelayout-wrapper-expand-component div.v-button.v-widget').first();
                await collapseButton.waitFor({ state: 'visible', timeout: 10000 });
                await collapseButton.click({ force: true });
                await page.waitForTimeout(800);
                console.log('    ✓ Sidebar collapsed');
            } catch (e) {
                console.log('    Warning: Could not collapse sidebar');
            }

            await closeOpenPopups();
        }

        async function expandSidebar() {
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

        let sidebarCollapsed = false;
        let screenshotCount = 0;
        const totalScreenshots = (hasIndoor ? 1 : 0) + (hasOutdoor ? 1 : 0) + (hasIndoorAndOutdoor ? 1 : 0);

        // Indoor View
        if (hasIndoor) {
            screenshotCount++;
            sendProgress(res, 75 + (screenshotCount / totalScreenshots) * 20, `Capturing indoor view (${screenshotCount}/${totalScreenshots})...`);
            console.log('Step 10: Indoor View...');
            if (await selectView(page, 'Indoor View')) {
                if (!sidebarCollapsed) {
                    await prepareForScreenshot();
                    sidebarCollapsed = true;
                }
                const screenshot = await takeScreenshot(page, 'INDOOR', sanitizedAddress, timestamp);
                screenshots.push(screenshot);
                if (hasOutdoor || hasIndoorAndOutdoor) {
                    await expandSidebar();
                    sidebarCollapsed = false;
                }
            } else {
                console.log('  ⚠ Skipping Indoor screenshot - view selection failed');
            }
        }

        // Outdoor View
        if (hasOutdoor) {
            screenshotCount++;
            sendProgress(res, 75 + (screenshotCount / totalScreenshots) * 20, `Capturing outdoor view (${screenshotCount}/${totalScreenshots})...`);
            console.log('Step 11: Outdoor View...');
            if (await selectView(page, 'Outdoor View')) {
                if (!sidebarCollapsed) {
                    await prepareForScreenshot();
                    sidebarCollapsed = true;
                }
                const screenshot = await takeScreenshot(page, 'OUTDOOR', sanitizedAddress, timestamp);
                screenshots.push(screenshot);
                if (hasIndoorAndOutdoor) {
                    await expandSidebar();
                    sidebarCollapsed = false;
                }
            } else {
                console.log('  ⚠ Skipping Outdoor screenshot - view selection failed');
            }
        }

        // Indoor & Outdoor View
        if (hasIndoorAndOutdoor) {
            screenshotCount++;
            sendProgress(res, 75 + (screenshotCount / totalScreenshots) * 20, `Capturing indoor & outdoor view (${screenshotCount}/${totalScreenshots})...`);
            console.log('Step 12: Indoor & Outdoor View...');

            // First, try to open the VIEW dropdown once to check what options exist
            // This avoids churning through 6 name variations if the dropdown itself won't open
            let actualViewName = null;
            try {
                const dropdownInfos = await page.evaluate(() => {
                    const inputs = document.querySelectorAll('input.v-filterselect-input.v-filterselect-input-readonly');
                    return Array.from(inputs).map((input, i) => ({
                        index: i,
                        value: input.value || '',
                        visible: input.offsetParent !== null
                    }));
                });

                // Check if a dropdown already shows a view-related value we can use
                const viewKeywords = ['indoor', 'outdoor', 'view', 'day', 'night'];
                const viewDropdown = dropdownInfos.find(d =>
                    d.visible && viewKeywords.some(kw => d.value.toLowerCase().includes(kw))
                );
                if (viewDropdown) {
                    console.log(`  Found VIEW dropdown with current value: "${viewDropdown.value}"`);
                }
            } catch (e) { }

            const possibleNames = [
                'Outdoor & Indoor',
                'Indoor & Outdoor',
                'Outdoor and Indoor',
                'Indoor and Outdoor',
                'Indoor & Outdoor View',
                'Outdoor & Indoor View'
            ];

            let success = false;
            let dropdownOpenFailed = false;
            for (const viewName of possibleNames) {
                const result = await selectView(page, viewName);
                if (result) {
                    success = true;
                    break;
                }
                // If selectView logged "Could not find VIEW dropdown" it means the dropdown
                // itself won't open - no point trying other names
                if (!success && !dropdownOpenFailed) {
                    // Check if the dropdown can be opened at all by looking at the last attempt
                    // If the first name already failed to open the dropdown, skip remaining names
                    const canOpen = await page.evaluate(() => {
                        const inputs = document.querySelectorAll('input.v-filterselect-input.v-filterselect-input-readonly');
                        return inputs.length > 0;
                    }).catch(() => false);
                    if (!canOpen) {
                        console.log('  No readonly dropdowns found on page - skipping remaining name variations');
                        break;
                    }
                    dropdownOpenFailed = true;
                    // Give the page a moment to recover before trying next name
                    await page.waitForTimeout(1000);
                }
            }

            if (success) {
                if (!sidebarCollapsed) {
                    await prepareForScreenshot();
                    sidebarCollapsed = true;
                }
                const screenshot = await takeScreenshot(page, 'OUTDOOR_INDOOR', sanitizedAddress, timestamp);
                screenshots.push(screenshot);
            } else {
                console.log('  ⚠ Skipping Indoor & Outdoor screenshot - view selection failed');
            }
        }

        sendProgress(res, 98, 'Finalizing...');

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('='.repeat(60));
        console.log(`✓ All steps complete! (${duration}s)`);
        console.log(`Screenshots captured: ${screenshots.length}`);

        screenshots.forEach((ss, idx) => {
            console.log(`  ${idx + 1}. ${ss.filename} - ${ss.size} KB`);
        });

        const totalSizeKB = (JSON.stringify(screenshots).length / 1024).toFixed(2);
        console.log(`Total response size: ~${totalSizeKB} KB`);
        console.log('='.repeat(60));

        await browser.close();

        // Send final success with screenshots
        sendProgress(res, 100, 'Complete!', 'success');
        const response = {
            success: true,
            screenshots,
            duration: parseFloat(duration),
            count: screenshots.length
        };
        res.write(`data: ${JSON.stringify({ ...response, final: true })}\n\n`);
        res.end();

    } catch (error) {
        console.error('Automation error:', error);
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('Error closing browser:', e.message);
            }
        }
        sendProgress(res, 0, error.message, 'error');
        res.end();
    }
});

// Original non-streaming endpoint (kept for backward compatibility)
app.post('/api/automate', async (req, res) => {
    let browser;
    const startTime = Date.now();

    try {
        const { address, carriers, coverageTypes } = req.body;

        if (!address) {
            return res.status(400).json({ success: false, error: 'Address is required' });
        }

        console.log('='.repeat(60));
        console.log('Starting Ookla automation');
        console.log('Address:', address);
        console.log('Carriers:', carriers);
        console.log('Coverage types:', coverageTypes);
        console.log('='.repeat(60));

        browser = await chromium.launch({
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

        // Step 1: Login
        console.log('Step 1: Navigating to login page...');
        await page.goto('https://cellanalytics.ookla.com/login', {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
        });

        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await humanWait(page, 800);

        console.log('Step 2: Filling credentials...');
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

        console.log('Step 3: Submitting login...');
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
            await browser.close();
            return res.status(401).json({ success: false, error: 'Login failed' });
        }

        console.log('  ✓ Login successful!');

        // Step 4: Day View
        console.log('Step 4: Changing to Day view...');
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

        // Step 5: Address
        console.log('Step 5: Entering address:', address);

        // The address search input is at the top of the page
        // We need to avoid the view dropdown which also has v-filterselect-input class
        let addressInput = null;

        // Try to find the search input by looking for the first visible text input
        // that is NOT readonly (the view dropdown is readonly)
        const allTextInputs = await page.locator('input[type="text"]').all();
        console.log(`  Found ${allTextInputs.length} text inputs on page`);

        for (let i = 0; i < allTextInputs.length; i++) {
            const input = allTextInputs[i];
            const isVisible = await input.isVisible().catch(() => false);
            const isReadonly = await input.getAttribute('readonly').catch(() => null);

            if (isVisible && !isReadonly) {
                // This should be the address search input
                addressInput = input;
                console.log(`  Found address input at index ${i} (not readonly)`);
                break;
            }
        }

        if (!addressInput) {
            // Fallback: just use the first non-readonly input
            addressInput = page.locator('input[type="text"]:not([readonly])').first();
            console.log('  Using fallback selector: input[type="text"]:not([readonly])');
        }

        await addressInput.waitFor({ state: 'visible', timeout: 15000 });

        // Clear existing content and type new address
        try {
            // Try to clear the field first
            await addressInput.fill(''); // Use fill to clear
            await page.waitForTimeout(300);
        } catch (e) {
            console.log('  Could not clear with fill, trying triple-click');
            await addressInput.click({ clickCount: 3 });
            await page.waitForTimeout(300);
            await addressInput.press('Backspace');
            await page.waitForTimeout(200);
        }

        // Type the address
        await humanTypeLocator(addressInput, address, page);
        console.log('  ✓ Address entered');
        await mediumWait(page);

        // Press Enter to search
        await addressInput.press('Enter');
        console.log('  ✓ Enter pressed');
        await longWait(page);
        await longWait(page);

        // Step 6: Network Provider
        console.log('Step 6: Opening Network Provider...');

        let networkProviderOpened = false;

        // Try multiple methods to open Network Provider
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`  Attempt ${attempt}/3...`);
                    await page.waitForTimeout(2000);
                }

                // Method 1: Try the original selector
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
                    // Method 2: Find by text and click parent row
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
                        // Method 3: Use evaluate to find and click
                        const result = await page.evaluate(() => {
                            const elements = document.querySelectorAll('*');
                            for (const el of elements) {
                                if (el.textContent && el.textContent.includes('Network Provider')) {
                                    // Find the tree spacer/toggle
                                    const toggle = el.querySelector('.v-treetable-treespacer, .v-treetable-node-closed, span');
                                    if (toggle) {
                                        toggle.click();
                                        return { success: true, method: 'evaluate-toggle' };
                                    }
                                    // Or just click the element itself
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

        // Step 7: Carriers
        const carriersToSelect = carriers || [];
        const allCarriers = { 'AT&T': 'AT&T US', 'Verizon': 'Verizon', 'T-Mobile': 'T-Mobile US' };

        console.log('Step 7: Configuring carriers...');
        for (const [userName, siteName] of Object.entries(allCarriers)) {
            try {
                // Try multiple methods to find the carrier checkbox
                let found = false;

                // Method 1: Find by label text
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

                // Method 2: Use evaluate to find and click
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

        // Step 8: LTE
        console.log('Step 8: Opening LTE options...');

        let lteOpened = false;

        // Try multiple methods to open LTE
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`  Attempt ${attempt}/3...`);
                    await page.waitForTimeout(2000);
                }

                // Method 1: Try the original selector
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
                    // Method 2: Find by text and click parent
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
                        // Method 3: Use evaluate
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

        // Step 9: RSRP
        console.log('Step 9: Selecting RSRP...');
        try {
            const rsrpRow = page.locator('tr').filter({ has: page.locator('span.v-captiontext:has-text("RSRP")') });
            const rsrpCheckbox = rsrpRow.locator('input[type="checkbox"]').first();
            await rsrpCheckbox.waitFor({ state: 'attached', timeout: 15000 });
            if (!(await rsrpCheckbox.isChecked())) {
                await rsrpCheckbox.check({ force: true });
                console.log('  ✓ RSRP checkbox selected');
                // Press Escape immediately to close any popup that might open
                await page.keyboard.press('Escape').catch(() => { });
                await page.waitForTimeout(300);
            }
            await mediumWait(page);

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

        // ============== SCREENSHOTS ==============

        const hasIndoor = coverageTypes?.includes('Indoor');
        const hasOutdoor = coverageTypes?.includes('Outdoor');
        const hasIndoorAndOutdoor = coverageTypes?.includes('Indoor & Outdoor');

        const screenshots = [];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedAddress = address.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

        // Helper function to close RSRP dialog using DOM manipulation
        // Using evaluate() is fast and doesn't cause browser freeze like clicking buttons
        async function closeOpenPopups() {
            console.log('  Closing any open dialogs...');
            try {
                // Use evaluate to remove dialog elements directly from DOM
                const removed = await page.evaluate(() => {
                    let removedCount = 0;

                    // Find and remove v-window elements (RSRP dialog)
                    const windows = document.querySelectorAll('.v-window, .v-window-wrap, .v-window-contents');
                    windows.forEach(w => {
                        w.remove();
                        removedCount++;
                    });

                    // Also remove any modal curtain/overlay
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

            // Small wait for page to stabilize
            await page.waitForTimeout(500);
            console.log('    ✓ Page settled');
        }

        // Helper function to zoom and collapse sidebar
        async function prepareForScreenshot() {
            console.log('  Zooming in...');
            try {
                // Find zoom button - improved strategy based on user feedback
                console.log('    Finding zoom button...');
                let zoomButton = null;

                // Strategy 1: Look inside the specific container structure user identified
                // The zoom button is usually in the split panel second container (map area)
                // We look for a button with FontAwesome icon 'plus' (or similar)
                try {
                    const containers = page.locator('.v-splitpanel-second-container');
                    if (await containers.count() > 0) {
                        const mapContainer = containers.first();
                        // Look for buttons inside this container
                        const buttons = mapContainer.locator('.v-button');
                        const count = await buttons.count();

                        for (let i = 0; i < count; i++) {
                            const btn = buttons.nth(i);
                            // Check for icon class
                            const icon = btn.locator('.v-icon.FontAwesome');
                            if (await icon.count() > 0) {
                                // Check if it's a plus icon (often \uf067 or class fa-plus or just looks like +)
                                // We'll assume the first one with a FontAwesome icon in this container is likely Zoom In
                                // or we can check the position (Zoom In is usually above Zoom Out)
                                zoomButton = btn;
                                console.log('    ✓ Found zoom button via container query');
                                break;
                            }
                        }
                    }
                } catch (e) {
                    console.log('    Error searching container:', e.message);
                }

                // Strategy 2: Fallback to global icon search if Strategy 1 failed
                if (!zoomButton) {
                    console.log('    Fallback: Searching globally for plus icon...');
                    const potentialButtons = page.locator('.v-button .v-icon.FontAwesome');
                    const count = await potentialButtons.count();
                    for (let i = 0; i < count; i++) {
                        const icon = potentialButtons.nth(i);
                        // Check for plus sign or gammas (rendered font awesome)
                        const className = await icon.getAttribute('class') || '';
                        // Sometimes we might need to check computed style content, but let's try assuming order
                        // Usually Zoom In is one of the first few buttons on the map
                        if (className.includes('FontAwesome')) {
                            // Let's grab the parent button
                            zoomButton = icon.locator('..').locator('..');
                            // break; // Don't break immediately, maybe verify? 
                            // For now let's just take the first one found if we are desperate
                            break;
                        }
                    }
                }

                if (!zoomButton) {
                    throw new Error('Zoom button not found');
                }

                await zoomButton.waitFor({ state: 'visible', timeout: 5000 });

                // Extra verification: Scroll into view
                // await zoomButton.scrollIntoViewIfNeeded();

                // Zoom in exactly 4 times
                console.log('    Clicking zoom button 4 times...');
                for (let i = 1; i <= 4; i++) {
                    await zoomButton.click({ force: true });
                    console.log(`      Click ${i}/4`);
                    // Wait for animation/update
                    await page.waitForTimeout(1000);
                }
                console.log('    ✓ Zoomed in 4x successfully');

            } catch (e) {
                console.log(`    Warning: Could not zoom: ${e.message}`);
                // Try logging finding for debugging context if failed
                console.log('    (Skipping zoom, hoping default view is okay)');
            }

            console.log('  Collapsing sidebar...');
            try {
                const collapseButton = page.locator('div.v-absolutelayout-wrapper-expand-component div.v-button.v-widget').first();
                await collapseButton.waitFor({ state: 'visible', timeout: 10000 });
                await collapseButton.click({ force: true });
                await page.waitForTimeout(800);
                console.log('    ✓ Sidebar collapsed');
            } catch (e) {
                console.log('    Warning: Could not collapse sidebar');
            }

            // Close any popups that might be open (like RSRP legend)
            await closeOpenPopups();
        }

        // Helper function to expand sidebar back
        async function expandSidebar() {
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

        let sidebarCollapsed = false;

        // Indoor View
        if (hasIndoor) {
            console.log('Step 10: Indoor View...');
            // Select view FIRST while sidebar is expanded
            if (await selectView(page, 'Indoor View')) {
                // Then prepare (zoom + collapse) and take screenshot
                if (!sidebarCollapsed) {
                    await prepareForScreenshot();
                    sidebarCollapsed = true;
                }
                const screenshot = await takeScreenshot(page, 'INDOOR', sanitizedAddress, timestamp);
                screenshots.push(screenshot);
                // Expand sidebar for next view selection
                if (hasOutdoor || hasIndoorAndOutdoor) {
                    await expandSidebar();
                    sidebarCollapsed = false;
                }
            } else {
                console.log('  ⚠ Skipping Indoor screenshot - view selection failed');
            }
        }

        // Outdoor View
        if (hasOutdoor) {
            console.log('Step 11: Outdoor View...');
            // Select view FIRST while sidebar is expanded
            if (await selectView(page, 'Outdoor View')) {
                // Then prepare (zoom + collapse) and take screenshot
                if (!sidebarCollapsed) {
                    await prepareForScreenshot();
                    sidebarCollapsed = true;
                }
                const screenshot = await takeScreenshot(page, 'OUTDOOR', sanitizedAddress, timestamp);
                screenshots.push(screenshot);
                // Expand sidebar for next view selection
                if (hasIndoorAndOutdoor) {
                    await expandSidebar();
                    sidebarCollapsed = false;
                }
            } else {
                console.log('  ⚠ Skipping Outdoor screenshot - view selection failed');
            }
        }

        // Indoor & Outdoor View
        if (hasIndoorAndOutdoor) {
            console.log('Step 12: Indoor & Outdoor View...');

            // First, check dropdown state to avoid churning through name variations if dropdown won't open
            try {
                const dropdownInfos = await page.evaluate(() => {
                    const inputs = document.querySelectorAll('input.v-filterselect-input.v-filterselect-input-readonly');
                    return Array.from(inputs).map((input, i) => ({
                        index: i,
                        value: input.value || '',
                        visible: input.offsetParent !== null
                    }));
                });

                const viewKeywords = ['indoor', 'outdoor', 'view', 'day', 'night'];
                const viewDropdown = dropdownInfos.find(d =>
                    d.visible && viewKeywords.some(kw => d.value.toLowerCase().includes(kw))
                );
                if (viewDropdown) {
                    console.log(`  Found VIEW dropdown with current value: "${viewDropdown.value}"`);
                }
            } catch (e) { }

            // Try multiple possible names
            const possibleNames = [
                'Outdoor & Indoor',
                'Indoor & Outdoor',
                'Outdoor and Indoor',
                'Indoor and Outdoor',
                'Indoor & Outdoor View',
                'Outdoor & Indoor View'
            ];

            let success = false;
            let dropdownOpenFailed = false;
            for (const viewName of possibleNames) {
                const result = await selectView(page, viewName);
                if (result) {
                    success = true;
                    break;
                }
                if (!success && !dropdownOpenFailed) {
                    const canOpen = await page.evaluate(() => {
                        const inputs = document.querySelectorAll('input.v-filterselect-input.v-filterselect-input-readonly');
                        return inputs.length > 0;
                    }).catch(() => false);
                    if (!canOpen) {
                        console.log('  No readonly dropdowns found on page - skipping remaining name variations');
                        break;
                    }
                    dropdownOpenFailed = true;
                    await page.waitForTimeout(1000);
                }
            }

            if (success) {
                // Then prepare (zoom + collapse) and take screenshot
                if (!sidebarCollapsed) {
                    await prepareForScreenshot();
                    sidebarCollapsed = true;
                }
                const screenshot = await takeScreenshot(page, 'OUTDOOR_INDOOR', sanitizedAddress, timestamp);
                screenshots.push(screenshot);
            } else {
                console.log('  ⚠ Skipping Indoor & Outdoor screenshot - view selection failed');
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('='.repeat(60));
        console.log(`✓ All steps complete! (${duration}s)`);
        console.log(`Screenshots captured: ${screenshots.length}`);

        // Log each screenshot details
        screenshots.forEach((ss, idx) => {
            console.log(`  ${idx + 1}. ${ss.filename} - ${ss.size} KB`);
        });

        const totalSizeKB = (JSON.stringify(screenshots).length / 1024).toFixed(2);
        console.log(`Total response size: ~${totalSizeKB} KB`);
        console.log('='.repeat(60));

        await browser.close();

        const response = {
            success: true,
            screenshots,
            duration: parseFloat(duration),
            count: screenshots.length
        };

        console.log('Sending response to frontend...');
        return res.json(response);

    } catch (error) {
        console.error('Automation error:', error);
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('Error closing browser:', e.message);
            }
        }
        return res.status(500).json({ success: false, error: error.message });
    }
});

// ============== START SERVER ==============

app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 Boingo Playwright Automation Backend');
    console.log('='.repeat(60));
    console.log(`   Port: ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log('');
    console.log('   Coverage Plot API:');
    console.log(`     POST http://localhost:${PORT}/api/automate`);
    console.log(`     POST http://localhost:${PORT}/api/automate/stream`);
    console.log('');
    console.log('   ROM Generator API:');
    console.log(`     POST http://localhost:${PORT}/api/rom/automate`);
    console.log(`     POST http://localhost:${PORT}/api/rom/automate/stream`);
    console.log(`     GET  http://localhost:${PORT}/api/rom/health`);
    console.log('');
    console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log('='.repeat(60));
});