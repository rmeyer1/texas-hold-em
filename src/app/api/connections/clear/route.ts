import { NextResponse } from 'next/server';
import { connectionManager } from '@/services/connectionManager';
import { getAuth } from 'firebase/auth';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized - Missing or invalid token' },
        { status: 401 }
      );
    }
    
    // Extract the token
    const token = authHeader.split('Bearer ')[1];
    
    // Verify the token (in a real app, you'd validate this token with Firebase Admin SDK)
    // For simplicity, we're just checking if it matches an environment variable
    if (token !== process.env.NEXT_PUBLIC_API_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid token' },
        { status: 401 }
      );
    }
    
    // Parse the request body to check for action type
    let action = 'clear';
    let options = {};
    try {
      const body = await request.json();
      if (body && body.action) {
        action = body.action;
      }
      if (body && body.options) {
        options = body.options;
      }
    } catch (error) {
      // If no body or invalid JSON, default to 'clear' action
    }
    
    // Handle different actions
    if (action === 'clear') {
      // Clear all connections
      connectionManager.clearAllConnections();
      
      // Wait a moment for Firebase to update
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get the updated connection count
      const count = connectionManager.getConnectionCount();
      
      return NextResponse.json(
        { 
          success: true, 
          message: 'All connections cleared successfully',
          count,
          connections: connectionManager.getActiveConnections().map(c => ({
            path: c.path,
            lastActivity: c.lastActivity.toISOString()
          }))
        },
        { status: 200 }
      );
    } else if (action === 'count') {
      // Just get the connection count
      const count = connectionManager.getConnectionCount();
      
      return NextResponse.json(
        { 
          success: true, 
          count,
          connections: connectionManager.getActiveConnections().map(c => ({
            path: c.path,
            lastActivity: c.lastActivity.toISOString()
          }))
        },
        { status: 200 }
      );
    } else if (action === 'refresh') {
      // Force a full refresh of connection tracking
      connectionManager.forceFullRefresh();
      
      // Wait a moment to get updated data
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Return the updated connection count
      const count = connectionManager.getConnectionCount();
      const connections = connectionManager.getActiveConnections();
      
      // Calculate connection stats
      const connectionStats = {
        recent: 0,
        medium: 0,
        old: 0
      };
      
      const now = new Date();
      connections.forEach(conn => {
        const idleTimeMs = now.getTime() - conn.lastActivity.getTime();
        const idleMinutes = Math.floor(idleTimeMs / 60000);
        
        if (idleMinutes < 5) {
          connectionStats.recent++;
        } else if (idleMinutes < 15) {
          connectionStats.medium++;
        } else {
          connectionStats.old++;
        }
      });
      
      return NextResponse.json(
        { 
          success: true, 
          message: 'Connection tracking refreshed',
          count,
          stats: connectionStats,
          discrepancy: count !== connections.length,
          connections: connections.map(c => ({
            path: c.path,
            lastActivity: c.lastActivity.toISOString()
          }))
        },
        { status: 200 }
      );
    } else if (action === 'debug') {
      // Get detailed debug information about connections
      const count = connectionManager.getConnectionCount();
      const connections = connectionManager.getActiveConnections();
      
      // Calculate connection stats
      const connectionStats = {
        recent: 0,
        medium: 0,
        old: 0
      };
      
      const now = new Date();
      connections.forEach(conn => {
        const idleTimeMs = now.getTime() - conn.lastActivity.getTime();
        const idleMinutes = Math.floor(idleTimeMs / 60000);
        
        if (idleMinutes < 5) {
          connectionStats.recent++;
        } else if (idleMinutes < 15) {
          connectionStats.medium++;
        } else {
          connectionStats.old++;
        }
      });
      
      return NextResponse.json(
        { 
          success: true, 
          count,
          stats: connectionStats,
          discrepancy: count !== connections.length,
          connections: connections.map(c => ({
            path: c.path,
            lastActivity: c.lastActivity.toISOString(),
            idleTime: Math.floor((now.getTime() - new Date(c.lastActivity).getTime()) / 1000)
          }))
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Supported actions: clear, count, refresh, debug' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error handling connections request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
} 