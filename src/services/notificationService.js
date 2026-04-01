// Notification Service for handling browser notifications
import { dataService, authService } from '../App';

class NotificationService {
  constructor() {
    this.permission = null;
    this.unsubscribes = [];
    this.previousMissions = new Map(); // Track previous missions to detect new ones
  }

  // Request notification permission
  async requestPermission() {
    if (!('Notification' in window)) {
      return { success: false, error: 'Notifications not supported' };
    }

    // Check current permission status
    const currentPermission = Notification.permission;
    this.permission = currentPermission;

    if (currentPermission === 'granted') {
      return { success: true, permission: 'granted' };
    }

    if (currentPermission === 'denied') {
      return { 
        success: false, 
        error: 'Permission denied. Please enable notifications in your browser settings.',
        canRequest: false 
      };
    }

    // Permission is 'default' - request it
    try {
      const permission = await Notification.requestPermission();
      this.permission = permission;

      if (permission === 'granted') {
        return { success: true, permission: 'granted' };
      } else if (permission === 'denied') {
        return { success: false, error: 'Permission denied by user', canRequest: false };
      } else {
        return { success: false, error: 'Permission dismissed', canRequest: true };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Show a browser notification
  showNotification(title, options = {}) {
    if (this.permission !== 'granted') {
      return;
    }

    const notificationOptions = {
      body: options.body || '',
      icon: options.icon || '/icon-192x192.png',
      badge: options.badge || '/icon-192x192.png',
      tag: options.tag || 'mission-notification',
      data: options.data || {},
      requireInteraction: options.requireInteraction || false,
      ...options
    };

    const notification = new Notification(title, notificationOptions);

    // Handle notification click
    notification.onclick = (event) => {
      event.preventDefault();
      window.focus();
      
      if (options.data?.missionId) {
        window.location.href = `/mission/${options.data.missionId}`;
      } else if (options.data?.url) {
        window.location.href = options.data.url;
      } else {
        window.location.href = '/missions';
      }
      
      notification.close();
    };

    // Auto-close after 10 seconds if not requiring interaction (longer display time)
    if (!notificationOptions.requireInteraction) {
      setTimeout(() => {
        notification.close();
      }, 10000);
    }

    return notification;
  }

  // Listen for new missions (for delivery guys / admins / monitors)
  startListeningForNewMissions(userId, userRole) {
    // Clear previous listeners
    this.stopListening();

    if (userRole === 'admin' || userRole === 'monitor') {
      // Admin or monitor: listen to all missions
      const unsubscribe = dataService.subscribeToAllMissions((missions) => {
        this.handleMissionsUpdate(missions, userId, userRole);
      });
      this.unsubscribes.push(unsubscribe);
    } else if (userRole === 'delivery_guy') {
      // Delivery guy: listen to assigned missions
      const unsubscribe = dataService.subscribeToMissions(userId, (missions) => {
        this.handleMissionsUpdate(missions, userId, userRole);
      });
      this.unsubscribes.push(unsubscribe);
    } else {
      // Pending / unknown roles should not listen for mission notifications
    }
    
    // Initialize previous missions to prevent notifications for existing missions on app open
    // We'll set this after the first update
    this.isFirstUpdate = true;
  }

  // Handle missions update and show notifications for new/assigned missions
  handleMissionsUpdate(missions, userId, userRole) {
    const currentMissionIds = new Set(missions.map(m => m.id));
    const previousMissionIds = this.previousMissions.get(userId) || new Set();

    // On first update, initialize with current missions to prevent notifications for existing missions
    if (this.isFirstUpdate) {
      this.previousMissions.set(userId, currentMissionIds);
      this.isFirstUpdate = false;
      return; // Don't show any notifications on app open
    }

    // Find new missions (missions that weren't in previous list)
    const newMissions = missions.filter(m => !previousMissionIds.has(m.id));

    // Find newly assigned missions (only show notifications for assigned missions, not available ones)
    const newlyAssignedMissions = newMissions.filter(m => 
      m.assignedTo === userId && m.status === 'assigned'
    );

    // Only show notifications for newly assigned missions (not for available/unassigned missions)
    if (userRole === 'delivery_guy' && newlyAssignedMissions.length > 0) {
      const assignedCount = newlyAssignedMissions.length;
      const title = assignedCount === 1 ? '🎯 New Mission Assigned!' : `🎯 ${assignedCount} New Missions Assigned!`;
      const body = `You have ${assignedCount} new mission${assignedCount !== 1 ? 's' : ''} assigned to you`;
      
      this.showNotification(
        title,
        {
          body: body,
          tag: `mission-assigned-${Date.now()}`,
          data: { url: '/missions' },
          requireInteraction: false
        }
      );
    } else if (newlyAssignedMissions.length > 0) {
      // For non-delivery-guy roles, show assigned missions
      const count = newlyAssignedMissions.length;
      this.showNotification(
        count === 1 ? '🎯 New Mission Assigned!' : `🎯 ${count} New Missions Assigned!`,
        {
          body: count === 1 
            ? 'You have a new mission assigned' 
            : `You have ${count} new missions assigned`,
          tag: `mission-assigned-${Date.now()}`,
          data: { url: '/missions' },
          requireInteraction: true
        }
      );
    }

    // For admin/monitor: only show notifications for newly created missions (not on app open)
    if ((userRole === 'admin' || userRole === 'monitor') && newMissions.length > 0) {
      const count = newMissions.length;
      this.showNotification(
        count === 1 ? '📋 New Mission Created' : `📋 ${count} New Missions Created`,
        {
          body: count === 1 
            ? 'A new mission has been created' 
            : `${count} new missions have been created`,
          tag: `mission-created-${Date.now()}`,
          data: { url: '/' },
          requireInteraction: false
        }
      );
    }

    // Update previous missions
    this.previousMissions.set(userId, currentMissionIds);
  }

  // Stop listening to updates
  stopListening() {
    this.unsubscribes.forEach(unsubscribe => {
      if (unsubscribe) unsubscribe();
    });
    this.unsubscribes = [];
  }

  // Cleanup
  cleanup() {
    this.stopListening();
    this.previousMissions.clear();
  }
}

// Export singleton instance
export const notificationService = new NotificationService();

