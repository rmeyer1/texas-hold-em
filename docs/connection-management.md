# Database Connection Management

This document explains how to use the database connection management features to reduce costs and improve performance.

## Overview

The application uses Firebase Realtime Database, which maintains active connections for real-time updates. These connections can accumulate and lead to increased costs if not properly managed. To address this, we've implemented:

1. **Automatic disconnection** of inactive connections after 20 minutes
2. **Manual connection clearing** through an admin interface
3. **Programmatic connection clearing** via an API endpoint
4. **Connection tracking and debugging** tools to help diagnose issues

## Automatic Disconnection

Connections are automatically monitored and disconnected after 20 minutes of inactivity. This happens in the background and requires no user intervention.

Key features:
- Connections are tracked with timestamps of last activity
- Every minute, the system checks for inactive connections
- Connections inactive for 20+ minutes are automatically closed

## Admin Interface

Administrators can view and manage connections through the admin interface:

1. Navigate to `/admin/connections` in your browser
2. Use the "Clear All Connections" button to immediately disconnect all connections
3. Use the "Refresh Connections" button to view the current active connections
4. Use the "Force Full Refresh" button to sync with Firebase's connection tracking
5. Use the "Show Debug Info" button to see detailed connection statistics
6. Monitor connection status with color-coded idle times:
   - Green: Less than 5 minutes idle
   - Yellow: 5-15 minutes idle
   - Red: More than 15 minutes idle (approaching auto-disconnect)

### Troubleshooting Connection Count Discrepancies

If the connection count in the admin interface doesn't match what you see in the Firebase console:

1. Use the "Force Full Refresh" button to sync with Firebase's connection tracking
2. Try clicking "Force Full Refresh" multiple times - each attempt uses more aggressive detection methods
3. If the issue persists, try clearing all connections with "Clear All Connections"
4. Check the browser console for any connection-related errors
5. Enable debug mode by clicking "Show Debug Info" to see more detailed information
6. Remember that the connection count in the admin interface is an approximation, as Firebase doesn't provide direct access to its internal connection list

## Programmatic Connection Management

For automated maintenance, you can manage connections programmatically:

### API Endpoint

```
POST /api/connections/clear
```

### Authentication

Include an authorization header with your API secret:

```
Authorization: Bearer your-api-secret
```

The API secret should match the `NEXT_PUBLIC_API_SECRET` environment variable.

### Actions

The API supports four actions:

1. **clear** - Clear all connections (default)
2. **count** - Get the current connection count and list of active connections
3. **refresh** - Force a full refresh of connection tracking
4. **debug** - Get detailed debug information about connections

Specify the action in the request body:

```json
{
  "action": "clear"
}
```

### Example (cURL)

```bash
# Clear all connections
curl -X POST https://your-domain.com/api/connections/clear \
  -H "Authorization: Bearer your-api-secret" \
  -H "Content-Type: application/json" \
  -d '{"action": "clear"}'

# Get connection count
curl -X POST https://your-domain.com/api/connections/clear \
  -H "Authorization: Bearer your-api-secret" \
  -H "Content-Type: application/json" \
  -d '{"action": "count"}'

# Force a full refresh of connection tracking
curl -X POST https://your-domain.com/api/connections/clear \
  -H "Authorization: Bearer your-api-secret" \
  -H "Content-Type: application/json" \
  -d '{"action": "refresh"}'

# Get detailed debug information
curl -X POST https://your-domain.com/api/connections/clear \
  -H "Authorization: Bearer your-api-secret" \
  -H "Content-Type: application/json" \
  -d '{"action": "debug"}'
```

### Example (JavaScript)

```javascript
// Clear all connections
async function clearConnections() {
  const response = await fetch('/api/connections/clear', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-secret',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'clear' })
  });
  
  const data = await response.json();
  console.log(data);
}

// Get connection count
async function getConnectionCount() {
  const response = await fetch('/api/connections/clear', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-secret',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'count' })
  });
  
  const data = await response.json();
  console.log('Connection count:', data.count);
  console.log('Active connections:', data.connections);
}

// Force a full refresh of connection tracking
async function refreshConnections() {
  const response = await fetch('/api/connections/clear', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer your-api-secret',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'refresh' })
  });
  
  const data = await response.json();
  console.log('Connection count after refresh:', data.count);
  console.log('Connection statistics:', data.stats);
}
```

## Scheduled Connection Clearing

You can set up a scheduled task to clear connections periodically:

1. Use the provided script in `scripts/clear-connections.js`
2. Set up a cron job or scheduled task to run it at desired intervals

### Script Usage

```bash
node clear-connections.js <api-url> <api-secret> [action]
```

Actions:
- `clear` - Clear all connections (default)
- `count` - Get the current connection count
- `refresh` - Force a full refresh of connection tracking
- `debug` - Get detailed debug information

### Example (cron job)

```bash
# Clear connections every day at 3:00 AM
0 3 * * * /usr/bin/node /path/to/your/app/scripts/clear-connections.js https://your-domain.com/api/connections/clear your-api-secret clear >> /path/to/logs/clear-connections.log 2>&1

# Check connection count every hour
0 * * * * /usr/bin/node /path/to/your/app/scripts/clear-connections.js https://your-domain.com/api/connections/clear your-api-secret count >> /path/to/logs/connection-count.log 2>&1

# Force a full refresh of connection tracking every 6 hours
0 */6 * * * /usr/bin/node /path/to/your/app/scripts/clear-connections.js https://your-domain.com/api/connections/clear your-api-secret refresh >> /path/to/logs/connection-refresh.log 2>&1
```

### Example (Windows Task Scheduler)

Create a batch file `clear-connections.bat`:

```batch
@echo off
node C:\path\to\your\app\scripts\clear-connections.js https://your-domain.com/api/connections/clear your-api-secret clear
```

Then set up a scheduled task to run this batch file at your desired interval.

## How Connection Tracking Works

Our connection tracking system works as follows:

1. **Registration**: When a component subscribes to a Firebase path, the connection is registered with the ConnectionManager
2. **Activity Tracking**: Each time data is received, the connection's last activity timestamp is updated
3. **Inactivity Check**: Every minute, connections are checked for inactivity
4. **Auto-Disconnect**: Connections inactive for 20+ minutes are automatically closed
5. **Sync with Firebase**: The system attempts to detect and track connections that were established before the ConnectionManager was initialized
6. **Zombie Detection**: The system tries to detect "zombie" connections that weren't properly closed
7. **Fallback Mechanism**: If the system can't track all connections, it uses a conservative estimate based on the detected connections

## Dealing with Connection Count Discrepancies

If you notice a discrepancy between the connection count in your admin dashboard and the Firebase console:

1. **Multiple Refresh Attempts**: Try clicking "Force Full Refresh" multiple times. Each attempt uses more aggressive detection methods.
2. **Clear All Connections**: If refreshing doesn't work, try clearing all connections to reset everything.
3. **Check Debug Information**: Enable debug mode to see detailed statistics about your connections.
4. **Scheduled Refreshes**: Set up a scheduled task to periodically refresh connections using the `refresh` action.
5. **Firebase Console Limitations**: Remember that the Firebase console's connection count is an approximation and may include connections from other sources or services.

## Best Practices

1. **Regular Monitoring**: Check the admin interface periodically to monitor connection usage
2. **Scheduled Clearing**: Set up scheduled clearing during off-peak hours
3. **Environment Variables**: Keep your API secret secure in environment variables
4. **Connection Limits**: Be aware of Firebase's connection limits for your plan
5. **Component Cleanup**: Ensure components properly unsubscribe from Firebase when unmounted
6. **Multiple Refresh Attempts**: If connection counts seem off, try multiple refresh attempts
7. **Debug Mode**: Use debug mode to get more detailed information about your connections

## Troubleshooting

If you encounter issues with connections:

1. Check the browser console for connection-related errors
2. Verify that the ConnectionManager is properly initialized
3. Ensure that all components are properly unsubscribing from connections when unmounted
4. Check that the API secret is correctly set in your environment variables
5. If the connection count seems incorrect, use the "Force Full Refresh" button in the admin interface multiple times
6. Enable debug mode to see more detailed information about your connections
7. Try clearing all connections to reset everything if other methods don't work 