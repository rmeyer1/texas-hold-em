#!/usr/bin/env node

/**
 * This script manages database connections.
 * It can be run as a scheduled task (e.g., using cron) to periodically clear connections.
 * 
 * Usage:
 * node clear-connections.js <api-url> <api-secret> [action]
 * 
 * Actions:
 * - clear: Clear all connections (default)
 * - count: Get the current connection count
 * - refresh: Force a full refresh of connection tracking
 * - debug: Get detailed debug information about connections
 * 
 * Example:
 * node clear-connections.js https://your-domain.com/api/connections/clear your-api-secret clear
 */

const https = require('https');
const http = require('http');

// Get command line arguments
const apiUrl = process.argv[2];
const apiSecret = process.argv[3];
const action = process.argv[4] || 'clear';

if (!apiUrl || !apiSecret) {
  console.error('Error: Missing required arguments');
  console.error('Usage: node clear-connections.js <api-url> <api-secret> [action]');
  console.error('Actions: clear (default), count, refresh, debug');
  process.exit(1);
}

// Validate action
if (!['clear', 'count', 'refresh', 'debug'].includes(action)) {
  console.error('Error: Invalid action. Supported actions: clear, count, refresh, debug');
  process.exit(1);
}

// Parse the URL
const url = new URL(apiUrl);
const options = {
  hostname: url.hostname,
  port: url.port || (url.protocol === 'https:' ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiSecret}`,
    'Content-Type': 'application/json',
  },
};

// Prepare request body
const requestBody = JSON.stringify({ action });

// Make the request
const requestLib = url.protocol === 'https:' ? https : http;
const req = requestLib.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (res.statusCode === 200) {
        if (action === 'clear') {
          logger.log('Success:', response.message);
          logger.log('Connection count after clearing:', response.count);
          
          if (response.connections && response.connections.length > 0) {
            logger.log('\nRemaining connections:');
            response.connections.forEach((conn, index) => {
              logger.log(`${index + 1}. Path: ${conn.path}`);
              logger.log(`   Last activity: ${new Date(conn.lastActivity).toLocaleString()}`);
            });
          } else {
            logger.log('No active connections found after clearing.');
          }
        } else if (action === 'count' || action === 'refresh') {
          logger.log('Connection count:', response.count);
          
          if (response.message) {
            logger.log(response.message);
          }
          
          if (response.stats) {
            logger.log('\nConnection Statistics:');
            logger.log(`- Recent (<5m): ${response.stats.recent}`);
            logger.log(`- Medium (5-15m): ${response.stats.medium}`);
            logger.log(`- Old (>15m): ${response.stats.old}`);
          }
          
          if (response.discrepancy) {
            logger.log('\nDiscrepancy detected between reported count and actual connections.');
          }
          
          if (response.connections && response.connections.length > 0) {
            logger.log('\nActive connections:');
            response.connections.forEach((conn, index) => {
              logger.log(`${index + 1}. Path: ${conn.path}`);
              logger.log(`   Last activity: ${new Date(conn.lastActivity).toLocaleString()}`);
            });
          } else {
            logger.log('No active connections found.');
          }
        } else if (action === 'debug') {
          logger.log('Connection count:', response.count);
          
          if (response.stats) {
            logger.log('\nConnection Statistics:');
            logger.log(`- Recent (<5m): ${response.stats.recent}`);
            logger.log(`- Medium (5-15m): ${response.stats.medium}`);
            logger.log(`- Old (>15m): ${response.stats.old}`);
          }
          
          if (response.discrepancy) {
            logger.log('\nDiscrepancy detected between reported count and actual connections.');
          }
          
          if (response.connections && response.connections.length > 0) {
            logger.log('\nDetailed connection information:');
            response.connections.forEach((conn, index) => {
              logger.log(`${index + 1}. Path: ${conn.path}`);
              logger.log(`   Last activity: ${new Date(conn.lastActivity).toLocaleString()}`);
              logger.log(`   Idle time: ${formatTime(conn.idleTime)}`);
            });
          } else {
            logger.log('No active connections found.');
          }
        }
        process.exit(0);
      } else {
        logger.error(`Error (${res.statusCode}):`, response.error || 'Unknown error');
        process.exit(1);
      }
    } catch (error) {
      logger.error('Error parsing response:', error.message);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  logger.error('Request error:', error.message);
  process.exit(1);
});

// Write request body
req.write(requestBody);
req.end();

logger.log(`Sending ${action} request to ${apiUrl}...`);

// Helper function to format time in seconds to a human-readable format
function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  }
} 