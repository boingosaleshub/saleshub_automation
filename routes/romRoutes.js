/**
 * ROM Automation Routes
 * 
 * Express router for ROM (Rate of Modulation) automation endpoints.
 * Handles the /api/rom/* routes.
 * 
 * Separation of Concerns:
 * - Routes are separate from business logic (services)
 * - Routes handle HTTP concerns (request/response, status codes)
 * - Business logic is delegated to romAutomation service
 */

const express = require('express');
const router = express.Router();
const { executeRomAutomation, executeRomAutomationStream, validateRequest } = require('../services/romAutomation');

/**
 * POST /api/rom/automate
 * 
 * Executes ROM automation to capture Indoor and Outdoor screenshots
 * from Ookla Cell Analytics for the given address and carriers.
 * 
 * Request Body:
 * {
 *   "address": "123 Main St, City, State",
 *   "carriers": ["AT&T", "Verizon"]
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "screenshots": [
 *     { "filename": "rom_INDOOR_...", "buffer": "base64...", "size": "150" },
 *     { "filename": "rom_OUTDOOR_...", "buffer": "base64...", "size": "145" }
 *   ],
 *   "duration": 120.5,
 *   "count": 2
 * }
 */
router.post('/automate', async (req, res) => {
    const startTime = Date.now();

    try {
        const { address, carriers } = req.body;

        // Log incoming request
        console.log('\n' + '━'.repeat(60));
        console.log('📸 ROM AUTOMATION REQUEST');
        console.log('━'.repeat(60));
        console.log('Time:', new Date().toISOString());
        console.log('Address:', address);
        console.log('Carriers:', carriers);
        console.log('━'.repeat(60));

        // Validate request
        const validation = validateRequest({ address, carriers });
        if (!validation.isValid) {
            console.log('❌ Validation failed:', validation.errors);
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: validation.errors
            });
        }

        // Execute automation
        const result = await executeRomAutomation({ address, carriers });

        // Log success
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('\n' + '━'.repeat(60));
        console.log('✅ ROM AUTOMATION SUCCESS');
        console.log('━'.repeat(60));
        console.log('Total Duration:', totalDuration + 's');
        console.log('Screenshots:', result.screenshots.length);
        console.log('━'.repeat(60));

        return res.json(result);

    } catch (error) {
        // Log error
        const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.error('\n' + '━'.repeat(60));
        console.error('❌ ROM AUTOMATION FAILED');
        console.error('━'.repeat(60));
        console.error('Duration:', totalDuration + 's');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('━'.repeat(60));

        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/rom/automate/stream
 *
 * SSE endpoint: runs ROM automation and streams progress events.
 * Same request body as /api/rom/automate. Response is text/event-stream.
 *
 * Event format: data: {"progress": 5, "step": "Initializing...", "status": "processing"}
 * Final event:  data: {"progress": 100, "step": "Complete", "final": true, "success": true, "excelFiles": [], "screenshots": [...]}
 * Error event:  data: {"progress": 0, "step": "Error", "final": true, "success": false, "error": "..."}
 */
router.post('/automate/stream', async (req, res) => {
    // SSE headers (same pattern as coverage-plot /api/automate/stream)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }

    const sendProgress = (progress, step, data = {}) => {
        const payload = { progress, step, ...data };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
        const { address, carriers } = req.body;

        console.log('\n' + '━'.repeat(60));
        console.log('📸 ROM AUTOMATION STREAM REQUEST');
        console.log('━'.repeat(60));
        console.log('Time:', new Date().toISOString());
        console.log('Address:', address);
        console.log('Carriers:', carriers);
        console.log('━'.repeat(60));

        const validation = validateRequest({ address, carriers });
        if (!validation.isValid) {
            sendProgress(0, 'Validation failed', {
                final: true,
                success: false,
                error: validation.errors.join('; '),
                status: 'error'
            });
            res.end();
            return;
        }

        await executeRomAutomationStream({ address, carriers }, sendProgress);
        res.end();
    } catch (error) {
        console.error('ROM stream error:', error.message);
        sendProgress(0, 'Error', {
            final: true,
            success: false,
            error: error.message,
            status: 'error'
        });
        res.end();
    }
});

/**
 * GET /api/rom/health
 * 
 * Health check endpoint for ROM automation service
 */
router.get('/health', (req, res) => {
    res.json({
        service: 'ROM Automation',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        endpoints: {
            automate: 'POST /api/rom/automate',
            automateStream: 'POST /api/rom/automate/stream'
        }
    });
});

module.exports = router;
