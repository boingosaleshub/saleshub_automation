require('dotenv').config();

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
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============== JOB STORAGE SYSTEM ==============
// In-memory storage for job status (can be replaced with database/Redis in production)
const jobStore = new Map();

// Helper functions for job management
function generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

async function saveJobStatus(jobId, status) {
    jobStore.set(jobId, {
        ...status,
        updatedAt: new Date().toISOString()
    });
}

async function getJobStatus(jobId) {
    return jobStore.get(jobId) || null;
}

async function updateJobStatus(jobId, updates) {
    const existing = jobStore.get(jobId);
    if (existing) {
        jobStore.set(jobId, {
            ...existing,
            ...updates,
            updatedAt: new Date().toISOString()
        });
    }
}

// Cleanup old jobs (run periodically)
function cleanupOldJobs() {
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    let cleanedCount = 0;
    
    for (const [jobId, job] of jobStore.entries()) {
        const updatedAt = new Date(job.updatedAt);
        if (updatedAt < cutoffTime && (job.status === 'completed' || job.status === 'failed')) {
            jobStore.delete(jobId);
            cleanedCount++;
        }
    }
    
    if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} old job(s)`);
    }
}

// Run cleanup every hour
setInterval(cleanupOldJobs, 60 * 60 * 1000);

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
            ooklaAutomate: 'POST /api/automate',
            ooklaAutomateStream: 'POST /api/automate/stream',
            jobStatus: 'GET /api/automate/status/:jobId'
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

// ============== SCREENSHOT HELPER FUNCTIONS ==============

async function selectView(page, viewName) {
    console.log(`  Selecting ${viewName}...`);

    // Try up to 3 times
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            if (attempt > 1) {
                console.log(`    Attempt ${attempt}/3...`);
                await page.waitForTimeout(2000);
                // Press Escape to close any open dropdowns
                await page.keyboard.press('Escape').catch(() => { });
                await page.waitForTimeout(500);
            }

            // Wait for page to be stable before trying dropdowns
            await page.waitForTimeout(1000);

            // Get all readonly dropdown inputs
            const allDropdowns = await page.locator('input.v-filterselect-input.v-filterselect-input-readonly').all();
            console.log(`    Found ${allDropdowns.length} readonly dropdowns on page`);

            let viewDropdownFound = false;

            // Try each dropdown and check its contents
            for (let i = 0; i < allDropdowns.length; i++) {
                const dropdown = allDropdowns[i];

                try {
                    // First, scroll into view
                    await dropdown.scrollIntoViewIfNeeded().catch(() => { });
                    await page.waitForTimeout(300);

                    const isVisible = await dropdown.isVisible().catch(() => false);
                    if (!isVisible) {
                        console.log(`    Dropdown ${i}: not visible, skipping`);
                        continue;
                    }

                    // Try multiple click methods
                    let optionListOpened = false;

                    // Method 1: Click the dropdown button (arrow next to input)
                    try {
                        const parent = await dropdown.locator('..').first();
                        const button = await parent.locator('.v-filterselect-button, div[class*="button"]').first();
                        if (await button.count() > 0) {
                            await button.click({ force: true, timeout: 5000 });
                            await page.waitForTimeout(1000);
                        }
                    } catch (e) { }

                    // Check if option list appeared
                    optionListOpened = await page.locator('#VAADIN_COMBOBOX_OPTIONLIST').isVisible().catch(() => false);

                    // Method 2: Click the input directly
                    if (!optionListOpened) {
                        await dropdown.click({ force: true, timeout: 5000 });
                        await page.waitForTimeout(1000);
                        optionListOpened = await page.locator('#VAADIN_COMBOBOX_OPTIONLIST').isVisible().catch(() => false);
                    }

                    // Method 3: Use evaluate to click
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

                    // Method 4: Wait longer for option list
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

                    // Get the options
                    const options = await page.locator('#VAADIN_COMBOBOX_OPTIONLIST span').allTextContents();
                    console.log(`    Dropdown ${i} options: ${JSON.stringify(options.slice(0, 5))}...`);

                    // Check if this is the VIEW dropdown
                    const isViewDropdown = options.some(opt =>
                        opt.includes('View') ||
                        opt.includes('Indoor') ||
                        opt.includes('Outdoor')
                    );

                    if (isViewDropdown) {
                        console.log(`    âœ“ Found VIEW dropdown at index ${i}`);
                        viewDropdownFound = true;
                        // Dropdown is open, proceed to select option
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

            // Dropdown is already open from the validation loop above
            // Just wait a bit for options to stabilize
            await page.waitForTimeout(500);

            // Try multiple ways to find the option
            let option = null;

            // Method 1: Find span with exact text inside td
            option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST td span:has-text("${viewName}")`).first();
            if (await option.count() === 0) {
                // Method 2: Find td that contains span with text
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST td:has(span:has-text("${viewName}"))`).first();
            }
            if (await option.count() === 0) {
                // Method 3: Case-insensitive span match
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST span`).filter({ hasText: new RegExp(viewName, 'i') }).first();
            }
            if (await option.count() === 0) {
                // Method 4: Partial match on first word
                const partialName = viewName.split(' ')[0]; // "Indoor", "Outdoor"
                option = page.locator(`#VAADIN_COMBOBOX_OPTIONLIST span`).filter({ hasText: new RegExp(partialName, 'i') }).first();
            }

            if (await option.count() === 0) {
                throw new Error(`Could not find option "${viewName}" in dropdown`);
            }

            await option.waitFor({ state: 'visible', timeout: 5000 });

            // Click the parent td if we found a span
            const tagName = await option.evaluate(el => el.tagName.toLowerCase());
            if (tagName === 'span') {
                const parentTd = option.locator('..');
                await parentTd.click({ force: true });
            } else {
                await option.click({ force: true });
            }

            console.log(`    âœ“ ${viewName} selected`);

            // Wait for map to update
            await page.waitForTimeout(2000);
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
            await page.waitForTimeout(1000);

            return true;

        } catch (error) {
            console.log(`    Attempt ${attempt} failed: ${error.message}`);

            // Close any open dropdowns before retry
            try {
                await page.keyboard.press('Escape');
                await page.waitForTimeout(500);
            } catch (e) { }

            if (attempt === 3) {
                console.error(`    âœ— Failed to select ${viewName} after 3 attempts`);
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
        console.log(`    âœ“ Screenshot captured: ${sizeKB} KB`);

        return {
            filename: `ookla_${viewType}_${sanitizedAddress}_${timestamp}.png`,
            buffer: buffer.toString('base64'),
            size: sizeKB
        };

    } catch (error) {
        console.error(`    âœ— Screenshot failed: ${error.message}`);
        throw error;
    }
}

// ============== OOKLA AUTOMATION ==============

// Helper to send SSE progress updates (safe - won't fail if client disconnected)
function sendProgress(res, progress, step, status = 'in_progress') {
    try {
        const data = JSON.stringify({ progress, step, status });
        res.write(`data: ${data}\n\n`);
    } catch (e) {
        // Client disconnected, but automation continues
        console.log('Client disconnected, but automation continues');
    }
}

// Core automation function that runs independently
// This function continues running even if the SSE connection is closed
async function runAutomation(jobId, payload, onProgress, onComplete, onError) {
    const { address, carriers, coverageTypes } = payload;
    let browser;
    const startTime = Date.now();

    try {
        // Update job status
        await updateJobStatus(jobId, {
            status: 'running',
            progress: 0,
            step: 'Initializing browser...'
        });

        // Send progress update
        onProgress(0, 'Initializing browser...', 'running');

        console.log('='.repeat(60));
        console.log(`Starting Ookla automation [Job: ${jobId}]`);
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
        await updateJobStatus(jobId, { progress: 5, step: 'Navigating to login page...' });
        onProgress(5, 'Navigating to login page...', 'running');
        console.log('Step 1: Navigating to login page...');
        await page.goto('https://cellanalytics.ookla.com/login', {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
        });

        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await humanWait(page, 800);

        await updateJobStatus(jobId, { progress: 10, step: 'Entering credentials...' });
        onProgress(10, 'Entering credentials...', 'running');
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

        await updateJobStatus(jobId, { progress: 15, step: 'Logging in...' });
        onProgress(15, 'Logging in...', 'running');
        console.log('Step 3: Submitting login...');
        const submitButton = page.locator('input[type="submit"], button[type="submit"]');
        await humanClick(page, submitButton);

        try {
            await page.waitForURL('**/cellanalytics.ookla.com/**', { timeout: 30000 });
            console.log('  âœ“ Redirected to dashboard');
        } catch (error) {
            console.log('  Navigation wait timeout, checking URL...');
        }

        await longWait(page);

        const currentUrl = page.url();
        if (currentUrl.includes('/login')) {
            await browser.close();
            const error = new Error('Login failed');
            await updateJobStatus(jobId, { status: 'failed', error: error.message });
            onError(error);
            return;
        }

        console.log('  âœ“ Login successful!');
        await updateJobStatus(jobId, { progress: 20, step: 'Login successful!' });
        onProgress(20, 'Login successful!', 'running');

        // Step 4: Day View
        await updateJobStatus(jobId, { progress: 22, step: 'Changing to day view...' });
        onProgress(22, 'Changing to day view...', 'running');
        console.log('Step 4: Changing to Day view...');
        try {
            const layersToggle = page.locator('a.leaflet-control-layers-toggle[title="Layers"]');
            await layersToggle.waitFor({ state: 'attached', timeout: 8000 });
            await layersToggle.hover();
            const dayRadioInput = page.locator('input[type="radio"].leaflet-control-layers-selector[name="leaflet-base-layers"]').nth(3);
            await dayRadioInput.click({ force: true, timeout: 2000 });
            console.log('  âœ“ Day view selected');
            await page.mouse.move(100, 100);
        } catch (error) {
            console.log('  Day view switch error, trying alternatives...');
            try {
                await page.evaluate(() => {
                    const radios = document.querySelectorAll('input[type="radio"].leaflet-control-layers-selector');
                    if (radios[3]) radios[3].click();
                });
                console.log('  âœ“ Day view selected (via evaluate)');
            } catch (e) {
                console.log('  Note: Could not change to Day view');
            }
        }

        // Step 5: Address
        await updateJobStatus(jobId, { progress: 28, step: 'Entering address...' });
        onProgress(28, 'Entering address...', 'running');
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
        console.log('  âœ“ Address entered');
        await mediumWait(page);

        await addressInput.press('Enter');
        console.log('  âœ“ Enter pressed');
        await longWait(page);
        await longWait(page);

        // Step 6: Network Provider
        await updateJobStatus(jobId, { progress: 38, step: 'Opening network provider...' });
        onProgress(38, 'Opening network provider...', 'running');
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
                    console.log('  âœ“ Network Provider section opened (method 1)');
                    break;
                }
            } catch (e1) {
                console.log(`  Method 1 failed: ${e1.message}`);

                try {
                    const toggle2 = page.locator('text=Network Provider').locator('..');
                    if (await toggle2.count() > 0) {
                        await toggle2.click({ force: true, timeout: 10000 });
                        networkProviderOpened = true;
                        console.log('  âœ“ Network Provider section opened (method 2)');
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
                            console.log(`  âœ“ Network Provider section opened (${result.method})`);
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
        await updateJobStatus(jobId, { progress: 48, step: 'Configuring carriers...' });
        onProgress(48, 'Configuring carriers...', 'running');
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
                                console.log(`  ${shouldBeChecked ? 'âœ“ Checked' : 'âœ— Unchecked'} ${siteName}`);
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
                        console.log(`  âœ“ ${result.action} ${siteName} (via evaluate)`);
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
        await updateJobStatus(jobId, { progress: 58, step: 'Opening LTE options...' });
        onProgress(58, 'Opening LTE options...', 'running');
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
                    console.log('  âœ“ LTE section opened (method 1)');
                    break;
                }
            } catch (e1) {
                console.log(`  Method 1 failed: ${e1.message}`);

                try {
                    const toggle2 = page.locator('text=LTE').locator('..');
                    if (await toggle2.count() > 0) {
                        await toggle2.click({ force: true, timeout: 10000 });
                        lteOpened = true;
                        console.log('  âœ“ LTE section opened (method 2)');
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
                            console.log('  âœ“ LTE section opened (evaluate)');
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
        await updateJobStatus(jobId, { progress: 68, step: 'Selecting RSRP...' });
        onProgress(68, 'Selecting RSRP...', 'running');
        console.log('Step 9: Selecting RSRP...');
        try {
            const rsrpRow = page.locator('tr').filter({ has: page.locator('span.v-captiontext:has-text("RSRP")') });
            const rsrpCheckbox = rsrpRow.locator('input[type="checkbox"]').first();
            await rsrpCheckbox.waitFor({ state: 'attached', timeout: 15000 });
            if (!(await rsrpCheckbox.isChecked())) {
                await rsrpCheckbox.check({ force: true });
                console.log('  âœ“ RSRP checkbox selected');
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
        await updateJobStatus(jobId, { progress: 75, step: 'Preparing screenshots...' });
        onProgress(75, 'Preparing screenshots...', 'running');

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
                    console.log(`    âœ“ Removed ${removed} dialog elements`);
                }
            } catch (e) {
                console.log('    Note: Error removing dialogs:', e.message);
            }
            await page.waitForTimeout(500);
            console.log('    âœ“ Page settled');
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
                                console.log('    âœ“ Found zoom button via container query');
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
                console.log('    âœ“ Zoomed in 4x successfully');

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
                console.log('    âœ“ Sidebar collapsed');
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
                    console.log('    âœ“ Sidebar expanded');
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
            const progress = 75 + (screenshotCount / totalScreenshots) * 20;
            const step = `Capturing indoor view (${screenshotCount}/${totalScreenshots})...`;
            await updateJobStatus(jobId, { progress, step });
            onProgress(progress, step, 'running');
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
                console.log('  âš  Skipping Indoor screenshot - view selection failed');
            }
        }

        // Outdoor View
        if (hasOutdoor) {
            screenshotCount++;
            const progress = 75 + (screenshotCount / totalScreenshots) * 20;
            const step = `Capturing outdoor view (${screenshotCount}/${totalScreenshots})...`;
            await updateJobStatus(jobId, { progress, step });
            onProgress(progress, step, 'running');
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
                console.log('  âš  Skipping Outdoor screenshot - view selection failed');
            }
        }

        // Indoor & Outdoor View
        if (hasIndoorAndOutdoor) {
            screenshotCount++;
            const progress = 75 + (screenshotCount / totalScreenshots) * 20;
            const step = `Capturing indoor & outdoor view (${screenshotCount}/${totalScreenshots})...`;
            await updateJobStatus(jobId, { progress, step });
            onProgress(progress, step, 'running');
            console.log('Step 12: Indoor & Outdoor View...');

            const possibleNames = [
                'Outdoor & Indoor',
                'Indoor & Outdoor',
                'Outdoor and Indoor',
                'Indoor and Outdoor',
                'Indoor & Outdoor View',
                'Outdoor & Indoor View'
            ];

            let success = false;
            for (const viewName of possibleNames) {
                if (await selectView(page, viewName)) {
                    success = true;
                    break;
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
                console.log('  âš  Skipping Indoor & Outdoor screenshot - view selection failed');
            }
        }

        await updateJobStatus(jobId, { progress: 98, step: 'Finalizing...' });
        onProgress(98, 'Finalizing...', 'running');

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('='.repeat(60));
        console.log(`âœ“ All steps complete! (${duration}s)`);
        console.log(`Screenshots captured: ${screenshots.length}`);

        screenshots.forEach((ss, idx) => {
            console.log(`  ${idx + 1}. ${ss.filename} - ${ss.size} KB`);
        });

        const totalSizeKB = (JSON.stringify(screenshots).length / 1024).toFixed(2);
        console.log(`Total response size: ~${totalSizeKB} KB`);
        console.log('='.repeat(60));

        await browser.close();

        const result = {
            success: true,
            screenshots,
            duration: parseFloat(duration),
            count: screenshots.length
        };

        // Update job status to completed
        await updateJobStatus(jobId, {
            status: 'completed',
            progress: 100,
            result
        });

        onComplete(result);

    } catch (error) {
        console.error(`Automation error [Job: ${jobId}]:`, error);
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('Error closing browser:', e.message);
            }
        }

        // Update job status to failed
        await updateJobStatus(jobId, {
            status: 'failed',
            error: error.message
        });

        onError(error);
    }
}

// SSE endpoint for streaming progress
app.post('/api/automate/stream', async (req, res) => {
    const { address, carriers, coverageTypes } = req.body;

    if (!address) {
        res.status(400).json({ error: 'Address is required' });
        return;
    }

    // Generate job ID
    const jobId = generateJobId();

    // Set up SSE headers (including job ID)
    res.setHeader('X-Job-Id', jobId);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Initialize job status
    await saveJobStatus(jobId, {
        jobId,
        status: 'running',
        progress: 0,
        step: 'Initializing...',
        createdAt: new Date().toISOString()
    });

    // Send initial job ID to client
    try {
        res.write(`data: ${JSON.stringify({ jobId, progress: 0, step: 'Initializing...', status: 'running' })}\n\n`);
    } catch (e) {
        // Client may have disconnected, but automation will continue
    }

    // Start automation in background (non-blocking)
    // Automation continues even if client disconnects
    runAutomation(
        jobId,
        { address, carriers, coverageTypes },
        // onProgress callback
        (progress, step, status) => {
            // Update stored status
            updateJobStatus(jobId, {
                progress,
                step,
                status
            }).catch(console.error);

            // Try to send to client via SSE, but don't fail if disconnected
            try {
                const data = { progress, step, status };
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            } catch (e) {
                // Client disconnected, but automation continues
                // Status can be retrieved via GET /api/automate/status/:jobId
            }
        },
        // onComplete callback
        async (result) => {
            const finalData = {
                final: true,
                success: true,
                ...result
            };

            // Try to send to client
            try {
                res.write(`data: ${JSON.stringify(finalData)}\n\n`);
                res.end();
            } catch (e) {
                // Client disconnected, but job is complete
                console.log(`Job ${jobId} completed, but client was disconnected`);
            }
        },
        // onError callback
        async (error) => {
            // Try to send error to client
            try {
                res.write(`data: ${JSON.stringify({ status: 'error', step: error.message, final: true })}\n\n`);
                res.end();
            } catch (e) {
                // Client disconnected
                console.log(`Job ${jobId} failed, but client was disconnected`);
            }
        }
    );

    // Handle client disconnect - DON'T stop automation
    req.on('close', () => {
        console.log(`Client disconnected for job ${jobId}, but automation continues`);
        // Automation continues running in background
        // Status can be retrieved via GET /api/automate/status/:jobId
    });
});

// Get job status endpoint
app.get('/api/automate/status/:jobId', async (req, res) => {
    const { jobId } = req.params;

    const jobStatus = await getJobStatus(jobId);

    if (!jobStatus) {
        return res.status(404).json({ error: 'Job not found' });
    }

    res.json(jobStatus);
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
            console.log('  âœ“ Redirected to dashboard');
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

        console.log('  âœ“ Login successful!');
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
            console.log('  âœ“ Day view selected');
            await page.mouse.move(100, 100);
        } catch (error) {
            console.log('  Day view switch error, trying alternatives...');
            try {
                await page.evaluate(() => {
                    const radios = document.querySelectorAll('input[type="radio"].leaflet-control-layers-selector');
                    if (radios[3]) radios[3].click();
                });
                console.log('  âœ“ Day view selected (via evaluate)');
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
        console.log('  âœ“ Address entered');
        await mediumWait(page);

        await addressInput.press('Enter');
        console.log('  âœ“ Enter pressed');
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
                    console.log('  âœ“ Network Provider section opened (method 1)');
                    break;
                }
            } catch (e1) {
                console.log(`  Method 1 failed: ${e1.message}`);

                try {
                    const toggle2 = page.locator('text=Network Provider').locator('..');
                    if (await toggle2.count() > 0) {
                        await toggle2.click({ force: true, timeout: 10000 });
                        networkProviderOpened = true;
                        console.log('  âœ“ Network Provider section opened (method 2)');
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
                            console.log(`  âœ“ Network Provider section opened (${result.method})`);
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
                                console.log(`  ${shouldBeChecked ? 'âœ“ Checked' : 'âœ— Unchecked'} ${siteName}`);
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
                        console.log(`  âœ“ ${result.action} ${siteName} (via evaluate)`);
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
                    console.log('  âœ“ LTE section opened (method 1)');
                    break;
                }
            } catch (e1) {
                console.log(`  Method 1 failed: ${e1.message}`);

                try {
                    const toggle2 = page.locator('text=LTE').locator('..');
                    if (await toggle2.count() > 0) {
                        await toggle2.click({ force: true, timeout: 10000 });
                        lteOpened = true;
                        console.log('  âœ“ LTE section opened (method 2)');
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
                            console.log('  âœ“ LTE section opened (evaluate)');
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
                console.log('  âœ“ RSRP checkbox selected');
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
                    console.log(`    âœ“ Removed ${removed} dialog elements`);
                }
            } catch (e) {
                console.log('    Note: Error removing dialogs:', e.message);
            }
            await page.waitForTimeout(500);
            console.log('    âœ“ Page settled');
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
                                console.log('    âœ“ Found zoom button via container query');
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
                console.log('    âœ“ Zoomed in 4x successfully');

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
                console.log('    âœ“ Sidebar collapsed');
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
                    console.log('    âœ“ Sidebar expanded');
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
                console.log('  âš  Skipping Indoor screenshot - view selection failed');
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
                console.log('  âš  Skipping Outdoor screenshot - view selection failed');
            }
        }

        // Indoor & Outdoor View
        if (hasIndoorAndOutdoor) {
            screenshotCount++;
            sendProgress(res, 75 + (screenshotCount / totalScreenshots) * 20, `Capturing indoor & outdoor view (${screenshotCount}/${totalScreenshots})...`);
            console.log('Step 12: Indoor & Outdoor View...');

            const possibleNames = [
                'Outdoor & Indoor',
                'Indoor & Outdoor',
                'Outdoor and Indoor',
                'Indoor and Outdoor',
                'Indoor & Outdoor View',
                'Outdoor & Indoor View'
            ];

            let success = false;
            for (const viewName of possibleNames) {
                if (await selectView(page, viewName)) {
                    success = true;
                    break;
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
                console.log('  âš  Skipping Indoor & Outdoor screenshot - view selection failed');
            }
        }

        sendProgress(res, 98, 'Finalizing...');

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('='.repeat(60));
        console.log(`âœ“ All steps complete! (${duration}s)`);
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
    console.log('ðŸš€ Boingo Playwright Automation Backend');
    console.log('='.repeat(60));
    console.log(`   Port: ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API: POST http://localhost:${PORT}/api/automate`);
    console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log('='.repeat(60));
});
