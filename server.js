const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

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

// ============== UTILITY ENDPOINTS ==============

// Health check endpoint (required by Render)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'Boingo Playwright Automation',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: 'GET /health',
            ooklaAutomate: 'POST /api/automate'
        }
    });
});

// ============== HELPER FUNCTIONS (Restored from User Snippet) ==============

function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Human-like wait - simulates natural pauses with slight variations (faster)
async function humanWait(page, baseMs) {
    // Add 10-30% variation to make it feel more natural
    const variation = baseMs * (0.1 + Math.random() * 0.2);
    const actualDelay = Math.floor(baseMs + (Math.random() > 0.5 ? variation : -variation * 0.3));
    await page.waitForTimeout(Math.max(actualDelay, 80)); // Minimum 80ms
}

// Simulate human-like typing for a locator element (faster typing)
async function humanTypeLocator(locator, text, page) {
    await locator.click();
    await page.waitForTimeout(randomDelay(80, 150));

    for (const char of text) {
        await locator.type(char, { delay: 0 });
        // Faster typing but still variable (30-70ms between keystrokes)
        await page.waitForTimeout(randomDelay(30, 70));
    }
}

// Move mouse to element in a faster but still natural path before clicking
async function humanClick(page, locator) {
    const box = await locator.boundingBox();
    if (box) {
        // Target position with slight randomness (don't always click dead center)
        const targetX = box.x + box.width / 2 + randomDelay(-5, 5);
        const targetY = box.y + box.height / 2 + randomDelay(-3, 3);

        // Quick but natural mouse move (fewer intermediate steps)
        await page.mouse.move(targetX, targetY, { steps: randomDelay(2, 3) });
        await page.waitForTimeout(randomDelay(30, 80));
    }
    await locator.click();
}

// Short wait for element interactions (faster but still natural)
async function shortWait(page) {
    await page.waitForTimeout(randomDelay(200, 400));
}

// Medium wait for page transitions/loads
async function mediumWait(page) {
    await page.waitForTimeout(randomDelay(500, 900));
}

// Longer wait for heavy content loading
async function longWait(page) {
    await page.waitForTimeout(randomDelay(1200, 2000));
}

// ============== OOKLA CELL ANALYTICS AUTOMATION ==============

app.post('/api/automate', async (req, res) => {
    let browser;

    try {
        const { address, carriers, coverageTypes } = req.body;

        if (!address) {
            return res.status(400).json({ success: false, error: 'Address is required' });
        }

        console.log('='.repeat(60));
        console.log('Starting Ookla automation (Restored Logic)');
        console.log('Address:', address);
        console.log('Carriers:', carriers);
        console.log('Coverage types:', coverageTypes);
        console.log('='.repeat(60));

        // Launch browser with stealth settings
        // NOTE: For Render/Vercel, we MUST use headless: true
        browser = await chromium.launch({
            headless: true, // Force headless for server deployment
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

        // Add stealth scripts
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };
        });

        const page = await context.newPage();

        console.log('Step 1: Navigating to login page...');
        await page.goto('https://cellanalytics.ookla.com/login', {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
        });

        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await humanWait(page, 800);

        console.log('Step 2: Filling in credentials with human-like typing...');
        const usernameInput = page.locator('input[name="username"]');
        const passwordInput = page.locator('input[name="password"]');

        await humanClick(page, usernameInput);
        await shortWait(page);
        await humanTypeLocator(usernameInput, 'zjanparian', page);
        await humanWait(page, 500);

        await humanClick(page, passwordInput);
        await shortWait(page);
        await humanTypeLocator(passwordInput, 'Boingo2025!', page);
        await humanWait(page, 600);

        console.log('Step 3: Submitting login form...');
        const submitButton = page.locator('input[type="submit"], button[type="submit"]');
        await humanClick(page, submitButton);

        try {
            await page.waitForURL('**/cellanalytics.ookla.com/**', { timeout: 30000 });
            console.log('✓ Redirected to dashboard');
        } catch (error) {
            console.log('Navigation wait timeout, checking URL...');
        }

        await longWait(page);

        const currentUrl = page.url();
        if (currentUrl.includes('/login')) {
            await browser.close();
            return res.status(401).json({ success: false, error: 'Login failed' });
        }

        console.log('✓ Login successful!');

        // Step 4: Map View to Day
        console.log('Step 4: Changing map view to Day...');
        try {
            const layersToggle = page.locator('a.leaflet-control-layers-toggle[title="Layers"]');
            await layersToggle.waitFor({ state: 'attached', timeout: 8000 });
            await layersToggle.hover();
            const dayRadioInput = page.locator('input[type="radio"].leaflet-control-layers-selector[name="leaflet-base-layers"]').nth(3);
            await dayRadioInput.click({ force: true, timeout: 2000 });
            console.log('✓ Day view selected');
            await page.mouse.move(100, 100);
        } catch (error) {
            console.log('Day view switch error, trying alternatives...', error.message);
            try {
                await page.evaluate(() => {
                    const radios = document.querySelectorAll('input[type="radio"].leaflet-control-layers-selector');
                    if (radios[3]) radios[3].click();
                });
                console.log('✓ Day view selected (via evaluate)');
            } catch (e1) {
                try {
                    await page.click('label:has-text("Day")', { force: true, timeout: 1000 });
                    console.log('✓ Day view selected (via label)');
                } catch (e2) {
                    console.log('Note: Could not change to Day view');
                }
            }
        }

        // Step 5: Address
        console.log('Step 5: Entering address:', address);
        const addressInput = page.locator('input[type="text"]').first();
        await addressInput.waitFor({ timeout: 10000 });
        await humanClick(page, addressInput);
        await shortWait(page);
        await addressInput.press('Control+A');
        await page.waitForTimeout(randomDelay(150, 300));
        await humanTypeLocator(addressInput, address, page);
        console.log('✓ Address entered');
        await mediumWait(page);
        await addressInput.press('Enter');
        console.log('✓ Enter pressed');
        await longWait(page);
        await mediumWait(page);
        await longWait(page); // Extra wait for map load

        // Step 6: Network Provider
        console.log('Step 6: Opening Network Provider options...');
        const networkProviderToggle = page.locator('text=Network Provider').locator('..').locator('span').first();
        await networkProviderToggle.waitFor({ timeout: 30000 });
        try {
            await networkProviderToggle.scrollIntoViewIfNeeded({ timeout: 5000 });
        } catch (e) {
            console.log('  - Warning: Scroll to Network Provider timed out, attempting click anyway...');
        }
        await networkProviderToggle.click({ force: true });
        console.log('✓ Network Provider section opened');
        await longWait(page);

        // Step 7: Carriers
        const carriersToSelect = carriers || [];
        const allCarriers = { 'AT&T': 'AT&T US', 'Verizon': 'Verizon', 'T-Mobile': 'T-Mobile US' };

        console.log('Step 7: Unchecking all carriers first...');
        for (const [userName, siteName] of Object.entries(allCarriers)) {
            try {
                const carrierLabel = page.locator(`label:has-text("${siteName}")`).first();
                await carrierLabel.waitFor({ state: 'visible', timeout: 5000 });
                const carrierLabelFor = await carrierLabel.getAttribute('for');
                const carrierCheckbox = page.locator(`#${carrierLabelFor}`);
                if (await carrierCheckbox.isChecked()) {
                    await carrierLabel.click();
                    console.log(`  Unchecked ${siteName}`);
                    await shortWait(page);
                }
            } catch (error) { }
        }
        await mediumWait(page);

        console.log('Step 7: Selecting user-selected carriers...');
        for (const carrierName of carriersToSelect) {
            try {
                let carrierLabel;
                if (carrierName === 'T-Mobile' || carrierName === 'T-Mobile US') {
                    carrierLabel = page.locator('label:has-text("T-Mobile US")').first();
                } else if (carrierName === 'AT&T') {
                    carrierLabel = page.locator('label:has-text("AT&T US")').first();
                } else if (carrierName === 'Verizon') {
                    carrierLabel = page.locator('label:has-text("Verizon")').first();
                } else {
                    carrierLabel = page.locator(`label:has-text("${carrierName}")`).first();
                }
                await carrierLabel.waitFor({ state: 'visible', timeout: 10000 });
                const carrierLabelFor = await carrierLabel.getAttribute('for');
                const carrierCheckbox = page.locator(`#${carrierLabelFor}`);
                if (!(await carrierCheckbox.isChecked())) {
                    try {
                        await carrierLabel.scrollIntoViewIfNeeded({ timeout: 5000 });
                    } catch (e) {
                        console.log(`  - Warning: Scroll to ${carrierName} timed out, attempting click anyway...`);
                    }
                    await carrierLabel.click({ force: true });
                    console.log(`✓ ${carrierName} selected`);
                }
            } catch (error) {
                console.log(`Error selecting ${carrierName}:`, error.message);
            }
            await mediumWait(page);
        }

        // Step 8: LTE
        console.log('Step 8: Opening LTE options...');
        const lteToggle = page.locator('text=LTE').locator('..').locator('span').first();
        await lteToggle.waitFor({ timeout: 30000 });
        try {
            await lteToggle.scrollIntoViewIfNeeded({ timeout: 5000 });
        } catch (e) {
            console.log('  - Warning: Scroll to LTE timed out, attempting click anyway...');
        }
        await lteToggle.click({ force: true });
        console.log('✓ LTE section opened');
        await longWait(page);

        // Step 9: RSRP
        console.log('Step 9: Selecting ONLY RSRP option...');
        try {
            const rsrpRow = page.locator('tr').filter({ has: page.locator('span.v-captiontext:has-text("RSRP")') });
            const rsrpCheckbox = rsrpRow.locator('input[type="checkbox"]').first();
            await rsrpCheckbox.waitFor({ state: 'attached', timeout: 15000 });
            if (!(await rsrpCheckbox.isChecked())) {
                try {
                    await rsrpCheckbox.scrollIntoViewIfNeeded({ timeout: 5000 });
                } catch (e) {
                    console.log('  - Warning: Scroll to RSRP timed out, attempting check anyway...');
                }
                await rsrpCheckbox.check({ force: true });
                console.log('✓ RSRP checkbox selected');
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
            console.log('Error with RSRP selection:', error.message);
        }
        await mediumWait(page);

        // Screenshots
        const hasIndoor = coverageTypes?.includes('Indoor');
        const hasOutdoor = coverageTypes?.includes('Outdoor');
        const hasIndoorAndOutdoor = coverageTypes?.includes('Indoor & Outdoor');

        const screenshots = [];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedAddress = address.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

        // Indoor View
        if (hasIndoor) {
            console.log('Step 10: Selecting Indoor View...');
            try {
                let indoorOutdoorDropdown = page.locator('div.v-filterselect:has(img[src*="inandoutdoor"])');
                if (await indoorOutdoorDropdown.count() === 0) indoorOutdoorDropdown = page.locator('div.v-filterselect.map-cb').filter({ has: page.locator('img[src*="indoor"]') });
                if (await indoorOutdoorDropdown.count() === 0) indoorOutdoorDropdown = page.locator('div.v-filterselect-map-cb').first();

                await indoorOutdoorDropdown.waitFor({ state: 'visible', timeout: 10000 });
                await humanClick(page, indoorOutdoorDropdown.locator('div.v-filterselect-button'));
                await shortWait(page);
                await page.waitForSelector('#VAADIN_COMBOBOX_OPTIONLIST', { state: 'visible', timeout: 5000 });

                const indoorViewOption = page.locator('#VAADIN_COMBOBOX_OPTIONLIST td:has-text("Indoor View")');
                await indoorViewOption.waitFor({ state: 'visible', timeout: 5000 });
                await indoorViewOption.click();
                console.log('✓ Indoor View selected');
                await mediumWait(page);

            } catch (error) {
                console.log('Error selecting Indoor View (primary):', error.message);
                try {
                    await page.evaluate(() => {
                        const dropdowns = document.querySelectorAll('div.v-filterselect');
                        for (const dropdown of dropdowns) {
                            if (dropdown.querySelector('img[src*="indoor"]')) {
                                dropdown.querySelector('div.v-filterselect-button')?.click();
                                break;
                            }
                        }
                    });
                    await shortWait(page);
                    await page.click('#VAADIN_COMBOBOX_OPTIONLIST td:has-text("Indoor View")', { timeout: 5000 });
                } catch (e) { }
            }

            // Zoom
            console.log('Step 11: Clicking zoom-in button twice...');
            // Robust class-based selector for Zoom button (FontAwesome icon inside button)
            const zoomButtonSelector = 'div.v-button.v-widget span.v-icon.FontAwesome';
            try {
                const zoomButton = page.locator(zoomButtonSelector).first();
                await zoomButton.waitFor({ state: 'visible', timeout: 10000 });
                await humanClick(page, zoomButton);
                await mediumWait(page);
                await humanClick(page, zoomButton);
                await mediumWait(page);
            } catch (e) {
                console.log('Error clicking zoom button:', e.message);
                try {
                    const mapContainer = page.locator('.v-splitpanel-second-container');
                    const plusBtn = mapContainer.locator('.v-button').first();
                    await plusBtn.click({ force: true });
                } catch (e2) { }
            }

            // Collapse
            console.log('Step 12: Clicking collapse button...');
            const collapseButtonSelector = 'div.v-absolutelayout-wrapper-expand-component div.v-button.v-widget';
            try {
                const collapseButton = page.locator(collapseButtonSelector).first();
                await collapseButton.waitFor({ state: 'visible', timeout: 10000 });
                await humanClick(page, collapseButton);
                await mediumWait(page);
            } catch (e) {
                console.log('Error clicking collapse button:', e.message);
            }

            // Screenshot
            console.log('Step 13: Taking Indoor screenshot...');
            try {
                await mediumWait(page);
                const contentArea = page.locator('.v-splitpanel-second-container.v-scrollable');
                await contentArea.waitFor({ state: 'visible', timeout: 10000 });
                const buffer = await contentArea.screenshot({ type: 'png' });
                screenshots.push({
                    filename: `ookla_INDOOR_${sanitizedAddress}_${timestamp}.png`,
                    buffer: buffer.toString('base64')
                });
                console.log('✓ Indoor screenshot captured');
            } catch (e) {
                console.log('Error taking Indoor screenshot, trying fallback...');
                try {
                    const buffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 50, width: 1280, height: 670 } });
                    screenshots.push({
                        filename: `ookla_INDOOR_fullpage_${sanitizedAddress}_${timestamp}.png`,
                        buffer: buffer.toString('base64')
                    });
                    console.log('✓ Indoor fallback screenshot captured');
                } catch (e2) { }
            }
        }

        // Outdoor View
        if (hasOutdoor) {
            console.log('Step 14: Selecting Outdoor View...');
            try {
                let indoorOutdoorDropdown = page.locator('div.v-filterselect:has(img[src*="inandoutdoor"])');
                if (await indoorOutdoorDropdown.count() === 0) indoorOutdoorDropdown = page.locator('div.v-filterselect.map-cb').filter({ has: page.locator('img[src*="indoor"]') });
                if (await indoorOutdoorDropdown.count() === 0) indoorOutdoorDropdown = page.locator('div.v-filterselect-map-cb').first();

                await indoorOutdoorDropdown.waitFor({ state: 'visible', timeout: 10000 });
                await humanClick(page, indoorOutdoorDropdown.locator('div.v-filterselect-button'));
                await shortWait(page);
                await page.waitForSelector('#VAADIN_COMBOBOX_OPTIONLIST', { state: 'visible', timeout: 5000 });

                const outdoorViewOption = page.locator('#VAADIN_COMBOBOX_OPTIONLIST td:has-text("Outdoor View")');
                await outdoorViewOption.waitFor({ state: 'visible', timeout: 5000 });
                await outdoorViewOption.click();
                console.log('✓ Outdoor View selected');
                await mediumWait(page);
                await longWait(page);

            } catch (error) {
                console.log('Error selecting Outdoor View:', error.message);
            }

            try {
                await mediumWait(page);
                const contentArea = page.locator('.v-splitpanel-second-container.v-scrollable');
                await contentArea.waitFor({ state: 'visible', timeout: 10000 });
                const buffer = await contentArea.screenshot({ type: 'png' });
                screenshots.push({
                    filename: `ookla_OUTDOOR_${sanitizedAddress}_${timestamp}.png`,
                    buffer: buffer.toString('base64')
                });
                console.log('✓ Outdoor screenshot captured');
            } catch (e) {
                try {
                    const buffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 50, width: 1280, height: 670 } });
                    screenshots.push({
                        filename: `ookla_OUTDOOR_fullpage_${sanitizedAddress}_${timestamp}.png`,
                        buffer: buffer.toString('base64')
                    });
                    console.log('✓ Outdoor fallback screenshot captured');
                } catch (e2) { }
            }
        }

        // Indoor & Outdoor
        if (hasIndoorAndOutdoor) {
            console.log('Step 16: Selecting Indoor & Outdoor View...');
            try {
                let indoorOutdoorDropdown = page.locator('div.v-filterselect:has(img[src*="inandoutdoor"])');
                if (await indoorOutdoorDropdown.count() === 0) indoorOutdoorDropdown = page.locator('div.v-filterselect.map-cb').filter({ has: page.locator('img[src*="indoor"]') });
                if (await indoorOutdoorDropdown.count() === 0) indoorOutdoorDropdown = page.locator('div.v-filterselect-map-cb').first();

                await indoorOutdoorDropdown.waitFor({ state: 'visible', timeout: 10000 });
                await humanClick(page, indoorOutdoorDropdown.locator('div.v-filterselect-button'));
                await shortWait(page);
                await page.waitForSelector('#VAADIN_COMBOBOX_OPTIONLIST', { state: 'visible', timeout: 5000 });

                let option = page.locator('#VAADIN_COMBOBOX_OPTIONLIST td:has-text("Outdoor & Indoor")');
                if (await option.count() === 0) option = page.locator('#VAADIN_COMBOBOX_OPTIONLIST td:has-text("Outdoor &amp; Indoor")');
                if (await option.count() === 0) option = page.locator('#VAADIN_COMBOBOX_OPTIONLIST td').filter({ hasText: /outdoor.*indoor/i });
                if (await option.count() === 0) option = page.locator('#VAADIN_COMBOBOX_OPTIONLIST td').filter({ hasText: /indoor.*outdoor/i });

                await option.waitFor({ state: 'visible', timeout: 5000 });
                await option.click();
                console.log('✓ Indoor & Outdoor View selected');
                await mediumWait(page);
                await longWait(page);

            } catch (error) {
                console.log('Error selecting Indoor & Outdoor View:', error.message);
            }

            try {
                await mediumWait(page);
                const contentArea = page.locator('.v-splitpanel-second-container.v-scrollable');
                await contentArea.waitFor({ state: 'visible', timeout: 10000 });
                const buffer = await contentArea.screenshot({ type: 'png' });
                screenshots.push({
                    filename: `ookla_OUTDOOR_INDOOR_${sanitizedAddress}_${timestamp}.png`,
                    buffer: buffer.toString('base64')
                });
                console.log('✓ Indoor & Outdoor screenshot captured');
            } catch (e) {
                try {
                    const buffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 50, width: 1280, height: 670 } });
                    screenshots.push({
                        filename: `ookla_OUTDOOR_INDOOR_fullpage_${sanitizedAddress}_${timestamp}.png`,
                        buffer: buffer.toString('base64')
                    });
                } catch (e2) { }
            }
        }

        console.log('✓ All steps complete!');
        await browser.close();

        return res.json({ success: true, screenshots });

    } catch (error) {
        console.error('Automation error:', error);
        if (browser) await browser.close();
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
    console.log(`   API: POST http://localhost:${PORT}/api/automate`);
    console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log('='.repeat(60));
});
