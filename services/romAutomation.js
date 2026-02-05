/**
 * ROM Automation Service
 * 
 * This service handles the ROM (Rate of Modulation) generator automation.
 * It captures Indoor and Outdoor view screenshots from Ookla Cell Analytics.
 * 
 * Separation of Concerns:
 * - This service is independent from Coverage Plot automation
 * - Uses shared ooklaHelpers for common Ookla operations
 * - Has its own business logic for ROM-specific requirements
 */

const ooklaHelpers = require('./ooklaHelpers');

/**
 * Execute ROM automation
 * @param {Object} params - Automation parameters
 * @param {string} params.address - The address to analyze
 * @param {string[]} params.carriers - Array of carrier names (e.g., ['AT&T', 'Verizon'])
 * @returns {Promise<Object>} Result with screenshots
 */
async function executeRomAutomation({ address, carriers }) {
    let browser = null;
    const startTime = Date.now();

    console.log('='.repeat(60));
    console.log('ROM AUTOMATION - Starting');
    console.log('='.repeat(60));
    console.log('Address:', address);
    console.log('Carriers:', carriers);
    console.log('Views: Indoor + Outdoor (hardcoded)');
    console.log('='.repeat(60));

    try {
        // Step 1: Create browser context
        console.log('\n[Step 1/10] Initializing browser...');
        const { browser: br, page } = await ooklaHelpers.createBrowserContext();
        browser = br;

        // Step 2: Login to Ookla
        console.log('\n[Step 2/10] Logging into Ookla...');
        await ooklaHelpers.loginToOokla(page);

        // Step 3: Select Day View
        console.log('\n[Step 3/10] Selecting Day View...');
        await ooklaHelpers.selectDayView(page);

        // Step 4: Enter Address
        console.log('\n[Step 4/10] Entering address...');
        await ooklaHelpers.enterAddress(page, address);

        // Step 5: Open Network Provider
        console.log('\n[Step 5/10] Opening Network Provider section...');
        await ooklaHelpers.openNetworkProvider(page);

        // Step 6: Configure Carriers
        console.log('\n[Step 6/10] Configuring carriers...');
        await ooklaHelpers.configureCarriers(page, carriers);

        // Step 7: Open LTE Section
        console.log('\n[Step 7/10] Opening LTE section...');
        await ooklaHelpers.openLTESection(page);

        // Step 8: Select RSRP
        console.log('\n[Step 8/10] Selecting RSRP...');
        await ooklaHelpers.selectRSRP(page);

        // Prepare for screenshots
        const screenshots = [];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedAddress = address.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

        // Helper to prepare for screenshot (zoom + collapse sidebar)
        async function prepareForScreenshot() {
            await ooklaHelpers.zoomIn(page, 4);
            await ooklaHelpers.collapseSidebar(page);
            await ooklaHelpers.closeOpenPopups(page);
        }

        // Step 9: Indoor View Screenshot
        console.log('\n[Step 9/10] Capturing Indoor View...');
        if (await ooklaHelpers.selectView(page, 'Indoor View')) {
            await prepareForScreenshot();
            const screenshot = await ooklaHelpers.takeScreenshot(page, 'rom_INDOOR', sanitizedAddress, timestamp);
            screenshots.push(screenshot);
            
            // Expand sidebar for next view selection
            await ooklaHelpers.expandSidebar(page);
        } else {
            console.log('  ⚠ Failed to select Indoor View');
        }

        // Step 10: Outdoor View Screenshot
        console.log('\n[Step 10/10] Capturing Outdoor View...');
        if (await ooklaHelpers.selectView(page, 'Outdoor View')) {
            await prepareForScreenshot();
            const screenshot = await ooklaHelpers.takeScreenshot(page, 'rom_OUTDOOR', sanitizedAddress, timestamp);
            screenshots.push(screenshot);
        } else {
            console.log('  ⚠ Failed to select Outdoor View');
        }

        // Close browser
        await browser.close();
        browser = null;

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n' + '='.repeat(60));
        console.log('ROM AUTOMATION - Complete');
        console.log('='.repeat(60));
        console.log(`Duration: ${duration}s`);
        console.log(`Screenshots captured: ${screenshots.length}`);
        screenshots.forEach((ss, idx) => {
            console.log(`  ${idx + 1}. ${ss.filename} - ${ss.size} KB`);
        });
        console.log('='.repeat(60));

        return {
            success: true,
            screenshots,
            duration: parseFloat(duration),
            count: screenshots.length
        };

    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('ROM AUTOMATION - Error');
        console.error('='.repeat(60));
        console.error('Error:', error.message);
        console.error('='.repeat(60));

        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('Error closing browser:', e.message);
            }
        }

        throw error;
    }
}

/**
 * Execute ROM automation with streaming progress (SSE).
 * Calls sendProgress(progress, step, extraData) at each step.
 * @param {Object} params - Automation parameters (address, carriers)
 * @param {Function} sendProgress - (progress, step, data?) => void; data can include { final, success, screenshots, excelFiles, error }
 * @returns {Promise<Object>} Result with screenshots (same as executeRomAutomation)
 */
async function executeRomAutomationStream({ address, carriers }, sendProgress) {
    let browser = null;
    const startTime = Date.now();

    const emit = (progress, step, data = {}) => {
        sendProgress(progress, step, { status: 'processing', ...data });
    };

    try {
        emit(5, 'Initializing...');
        const { browser: br, page } = await ooklaHelpers.createBrowserContext();
        browser = br;

        emit(10, 'Opening browser...');
        emit(15, 'Logging in...');
        await ooklaHelpers.loginToOokla(page);

        emit(22, 'Selecting day view...');
        await ooklaHelpers.selectDayView(page);

        emit(28, 'Entering address...');
        await ooklaHelpers.enterAddress(page, address);

        emit(35, 'Opening network provider...');
        await ooklaHelpers.openNetworkProvider(page);

        emit(45, 'Configuring carriers...');
        await ooklaHelpers.configureCarriers(page, carriers);

        emit(55, 'Opening LTE section...');
        await ooklaHelpers.openLTESection(page);

        emit(65, 'Selecting RSRP...');
        await ooklaHelpers.selectRSRP(page);

        const screenshots = [];
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedAddress = address.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);

        async function prepareForScreenshot() {
            await ooklaHelpers.zoomIn(page, 4);
            await ooklaHelpers.collapseSidebar(page);
            await ooklaHelpers.closeOpenPopups(page);
        }

        emit(70, 'Preparing screenshots...');
        emit(75, 'Capturing indoor view...');
        if (await ooklaHelpers.selectView(page, 'Indoor View')) {
            await prepareForScreenshot();
            const screenshot = await ooklaHelpers.takeScreenshot(page, 'rom_INDOOR', sanitizedAddress, timestamp);
            screenshots.push(screenshot);
            await ooklaHelpers.expandSidebar(page);
        }

        emit(85, 'Capturing outdoor view...');
        if (await ooklaHelpers.selectView(page, 'Outdoor View')) {
            await prepareForScreenshot();
            const screenshot = await ooklaHelpers.takeScreenshot(page, 'rom_OUTDOOR', sanitizedAddress, timestamp);
            screenshots.push(screenshot);
        }

        await browser.close();
        browser = null;

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('\n' + '='.repeat(60));
        console.log('ROM AUTOMATION (STREAM) - Complete');
        console.log('='.repeat(60));
        console.log(`Duration: ${duration}s`);
        console.log(`Screenshots captured: ${screenshots.length}`);
        console.log('='.repeat(60));

        const result = {
            success: true,
            screenshots,
            duration: parseFloat(duration),
            count: screenshots.length
        };
        sendProgress(100, 'Complete', {
            final: true,
            success: true,
            screenshots: result.screenshots,
            excelFiles: [],
            duration: result.duration,
            count: result.count
        });
        return result;
    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('ROM AUTOMATION (STREAM) - Error');
        console.error('='.repeat(60));
        console.error('Error:', error.message);
        console.error('='.repeat(60));

        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                console.error('Error closing browser:', e.message);
            }
        }

        sendProgress(0, 'Error', {
            final: true,
            success: false,
            error: error.message
        });
        throw error;
    }
}

/**
 * Validate ROM automation request
 * @param {Object} params - Request parameters
 * @returns {Object} Validation result
 */
function validateRequest({ address, carriers }) {
    const errors = [];

    if (!address || typeof address !== 'string' || address.trim().length === 0) {
        errors.push('Address is required and must be a non-empty string');
    }

    if (!carriers || !Array.isArray(carriers) || carriers.length === 0) {
        errors.push('Carriers is required and must be a non-empty array');
    } else {
        const validCarriers = ['AT&T', 'Verizon', 'T-Mobile'];
        const invalidCarriers = carriers.filter(c => !validCarriers.includes(c));
        if (invalidCarriers.length > 0) {
            errors.push(`Invalid carriers: ${invalidCarriers.join(', ')}. Valid options: ${validCarriers.join(', ')}`);
        }
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

module.exports = {
    executeRomAutomation,
    executeRomAutomationStream,
    validateRequest
};
