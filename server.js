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

// ============== OOKLA CELL ANALYTICS AUTOMATION ==============

app.post('/api/automate', async (req, res) => {
    let browser;

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

        // Launch browser
        browser = await chromium.launch({
            headless: true,
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

        // Stealth mode
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            window.chrome = { runtime: {} };
        });

        const page = await context.newPage();

        // Step 1: Login
        console.log('Step 1: Navigating to login...');
        await page.goto('https://cellanalytics.ookla.com/login', {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
        });

        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await humanWait(page, 800);

        console.log('Step 2: Entering credentials...');
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

        console.log('Step 3: Submitting login...');
        const submitButton = page.locator('input[type="submit"], button[type="submit"]');
        await humanClick(page, submitButton);

        try {
            await page.waitForURL('**/cellanalytics.ookla.com/**', { timeout: 30000 });
            console.log('✓ Login successful');
        } catch (error) {
            console.log('Navigation wait timeout, checking URL...');
        }

        await longWait(page);

        const currentUrl = page.url();
        if (currentUrl.includes('/login')) {
            await browser.close();
            return res.status(401).json({ success: false, error: 'Login failed' });
        }

        // Step 4: Day view
        console.log('Step 4: Selecting Day view...');
        try {
            const layersToggle = page.locator('a.leaflet-control-layers-toggle[title="Layers"]');
            await layersToggle.waitFor({ state: 'attached', timeout: 8000 });
            await layersToggle.hover();
            const dayRadioInput = page.locator('input[type="radio"].leaflet-control-layers-selector[name="leaflet-base-layers"]').nth(3);
            await dayRadioInput.click({ force: true, timeout: 2000 });
            console.log('✓ Day view selected');
            await page.mouse.move(100, 100);
        } catch (error) {
            console.log('Day view switch failed, trying fallback...');
            try {
                await page.evaluate(() => {
                    const radios = document.querySelectorAll('input[type="radio"].leaflet-control-layers-selector');
                    if (radios[3]) radios[3].click();
                });
            } catch (e) { }
        }

        // Step 5: Enter address
        console.log('Step 5: Entering address...');
        const addressInput = page.locator('input[type="text"]').first();
        await addressInput.waitFor({ timeout: 10000 });
        await humanClick(page, addressInput);
        await shortWait(page);
        await addressInput.press('Control+A');
        await page.waitForTimeout(randomDelay(150, 300));
        await humanTypeLocator(addressInput, address, page);
        await mediumWait(page);
        await addressInput.press('Enter');
        console.log('✓ Address entered');
        await longWait(page);
        await mediumWait(page);
        await longWait(page);

        // Step 6: Network Provider
        console.log('Step 6: Configuring Network Providers...');
        try {
            const networkProviderToggle = page.locator('text=Network Provider').locator('..').locator('span').first();
            await networkProviderToggle.waitFor({ state: 'attached', timeout: 20000 });
            try {
                await networkProviderToggle.scrollIntoViewIfNeeded({ timeout: 8000 });
            } catch (e) {
                console.log('  - Warning: Scroll to Network Provider timed out, attempting click anyway...');
            }
            // Check if already expanded (optional logic could go here, but usually it's a toggle)
            // Just click with force
            await networkProviderToggle.click({ timeout: 10000, force: true });
            console.log('✓ Network Provider section interaction attempted');
        } catch (error) {
            console.error('Error in Step 6 (Network Provider):', error.message);
            throw new Error(`Failed to toggle Network Provider: ${error.message}`);
        }
        await longWait(page);

        // Step 7: Configure carriers
        const carriersToSelect = carriers || [];
        const allCarriers = { 'AT&T': 'AT&T US', 'Verizon': 'Verizon', 'T-Mobile': 'T-Mobile US' };

        // Uncheck all
        for (const [userName, siteName] of Object.entries(allCarriers)) {
            try {
                const carrierLabel = page.locator(`label:has-text("${siteName}")`).first();
                await carrierLabel.waitFor({ state: 'visible', timeout: 5000 });
                const carrierLabelFor = await carrierLabel.getAttribute('for');
                const carrierCheckbox = page.locator(`#${carrierLabelFor}`);
                if (await carrierCheckbox.isChecked()) {
                    await carrierLabel.click();
                    await shortWait(page);
                }
            } catch (error) { }
        }
        await mediumWait(page);

        // Check selected
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
                    await carrierLabel.scrollIntoViewIfNeeded();
                    await carrierLabel.click();
                    console.log(`✓ ${carrierName} selected`);
                }
            } catch (error) {
                console.log(`Error selecting ${carrierName}:`, error.message);
            }
            await mediumWait(page);
        }

        // Step 8: LTE options
        console.log('Step 8: Configuring LTE...');
        try {
            const lteToggle = page.locator('text=LTE').locator('..').locator('span').first();
            await lteToggle.waitFor({ state: 'attached', timeout: 20000 });
            try {
                await lteToggle.scrollIntoViewIfNeeded({ timeout: 8000 });
            } catch (e) {
                console.log('  - Warning: Scroll to LTE timed out, attempting click anyway...');
            }
            await lteToggle.click({ timeout: 10000, force: true });
            console.log('✓ LTE section interaction attempted');
        } catch (error) {
            console.error('Error in Step 8 (LTE):', error.message);
            // We continue because RSRP might still be reachable or visible? 
            // But usually it's inside LTE. Let's log and try to proceed.
        }
        await longWait(page);

        // Step 9: RSRP
        console.log('Step 9: Selecting RSRP...');
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
                await rsrpCheckbox.check({ force: true, timeout: 5000 });
            }
            await mediumWait(page);

            // Uncheck others
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
            console.log('✓ RSRP configured');
        } catch (error) {
            console.log('RSRP selection error:', error.message);
        }
        await mediumWait(page);

        // Capture screenshots
        const hasIndoor = coverageTypes?.includes('Indoor');
        const hasOutdoor = coverageTypes?.includes('Outdoor');
        const hasIndoorAndOutdoor = coverageTypes?.includes('Indoor & Outdoor');

        const screenshots = [];
        const contentAreaSelector = '#ROOT-2521314 > div > div.v-verticallayout.v-layout.v-vertical.v-widget.v-has-width.v-has-height > div > div:nth-child(2) > div > div.v-splitpanel-horizontal.v-widget.v-has-width.v-has-height > div > div.v-splitpanel-second-container.v-scrollable';
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedAddress = address.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

        async function captureScreenshot(viewType, viewName) {
            console.log(`Capturing ${viewName} screenshot...`);
            try {
                let indoorOutdoorDropdown = page.locator('div.v-filterselect:has(img[src*="inandoutdoor"])');
                if (await indoorOutdoorDropdown.count() === 0) {
                    indoorOutdoorDropdown = page.locator('div.v-filterselect.map-cb').filter({ has: page.locator('img[src*="indoor"]') });
                }
                if (await indoorOutdoorDropdown.count() === 0) {
                    indoorOutdoorDropdown = page.locator('div.v-filterselect-map-cb').first();
                }

                await indoorOutdoorDropdown.waitFor({ state: 'visible', timeout: 10000 });
                const dropdownButton = indoorOutdoorDropdown.locator('div.v-filterselect-button');
                await humanClick(page, dropdownButton);
                await shortWait(page);
                await page.waitForSelector('#VAADIN_COMBOBOX_OPTIONLIST', { state: 'visible', timeout: 5000 });

                let viewOption;
                if (viewType === 'indoor') {
                    viewOption = page.locator('#VAADIN_COMBOBOX_OPTIONLIST td:has-text("Indoor View")');
                } else if (viewType === 'outdoor') {
                    viewOption = page.locator('#VAADIN_COMBOBOX_OPTIONLIST td:has-text("Outdoor View")');
                } else {
                    viewOption = page.locator('#VAADIN_COMBOBOX_OPTIONLIST td').filter({ hasText: /outdoor.*indoor/i });
                }

                await viewOption.waitFor({ state: 'visible', timeout: 5000 });
                await viewOption.click();
                console.log(`✓ ${viewName} selected`);
                await mediumWait(page);

                // Zoom
                const zoomButtonSelector = '#ROOT-2521314 > div > div.v-verticallayout.v-layout.v-vertical.v-widget.v-has-width.v-has-height > div > div:nth-child(2) > div > div.v-splitpanel-horizontal.v-widget.v-has-width.v-has-height > div > div.v-splitpanel-second-container.v-scrollable > div > div > div > div:nth-child(1) > div > div.v-panel-content.v-scrollable > div > div > div > div:nth-child(1) > div > div > div > div:nth-child(1) > div > div > div:nth-child(1) > div';
                try {
                    const zoomButton = page.locator(zoomButtonSelector);
                    await zoomButton.waitFor({ state: 'visible', timeout: 10000 });
                    await humanClick(page, zoomButton);
                    await mediumWait(page);
                    await humanClick(page, zoomButton);
                    await mediumWait(page);
                } catch (e) { }

                // Collapse
                const collapseButtonSelector = '#ROOT-2521314 > div > div.v-verticallayout.v-layout.v-vertical.v-widget.v-has-width.v-has-height > div > div:nth-child(2) > div > div.v-splitpanel-horizontal.v-widget.v-has-width.v-has-height > div > div.v-splitpanel-second-container.v-scrollable > div > div > div > div.v-absolutelayout-wrapper.v-absolutelayout-wrapper-expand-component > div > div > div > div';
                try {
                    const collapseButton = page.locator(collapseButtonSelector);
                    await collapseButton.waitFor({ state: 'visible', timeout: 10000 });
                    await humanClick(page, collapseButton);
                    await mediumWait(page);
                } catch (e) { }

                await longWait(page);

                const contentArea = page.locator(contentAreaSelector);
                await contentArea.waitFor({ state: 'visible', timeout: 10000 });
                const screenshotBuffer = await contentArea.screenshot({ type: 'png' });

                screenshots.push({
                    filename: `ookla_${viewName.toUpperCase().replace(/ /g, '_')}_${sanitizedAddress}_${timestamp}.png`,
                    buffer: screenshotBuffer.toString('base64')
                });
                console.log(`✓ ${viewName} screenshot captured`);
            } catch (error) {
                console.log(`Error capturing ${viewName}:`, error.message);
                try {
                    const screenshotBuffer = await page.screenshot({ type: 'png', clip: { x: 0, y: 50, width: 1280, height: 670 } });
                    screenshots.push({
                        filename: `ookla_${viewName.toUpperCase().replace(/ /g, '_')}_fullpage_${sanitizedAddress}_${timestamp}.png`,
                        buffer: screenshotBuffer.toString('base64')
                    });
                } catch (fallbackError) { }
            }
        }

        if (hasIndoor) await captureScreenshot('indoor', 'Indoor');
        if (hasOutdoor) await captureScreenshot('outdoor', 'Outdoor');
        if (hasIndoorAndOutdoor) await captureScreenshot('indooroutdoor', 'Outdoor & Indoor');

        console.log('='.repeat(60));
        console.log('✓ Automation complete!');
        console.log(`Screenshots captured: ${screenshots.length}`);
        console.log('='.repeat(60));

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
