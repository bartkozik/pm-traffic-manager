export class CleanupScheduler {
  constructor(retentionEngine, intervalMinutes = 15) {
    this.retentionEngine = retentionEngine;
    this.intervalMinutes = intervalMinutes;
    this.intervalId = null;
    this.isRunning = false;
    this.lastRun = null;
    this.nextRun = null;
  }

  start() {
    if (this.isRunning) {
      console.log('Cleanup scheduler is already running');
      return;
    }

    console.log(`Starting cleanup scheduler with ${this.intervalMinutes} minute intervals`);
    this.isRunning = true;
    this.updateNextRunTime();

    // Run cleanup immediately on start (optional)
    // setTimeout(() => this.runCleanup(), 5000);

    // Schedule recurring cleanup
    this.intervalId = setInterval(() => {
      this.runCleanup();
    }, this.intervalMinutes * 60 * 1000);
  }

  stop() {
    if (!this.isRunning) {
      console.log('Cleanup scheduler is not running');
      return;
    }

    console.log('Stopping cleanup scheduler');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.nextRun = null;
  }

  async runCleanup() {
    if (!this.isRunning) return;

    try {
      console.log('Running scheduled cleanup...');
      this.lastRun = new Date();
      
      const result = await this.retentionEngine.runCleanup();
      
      console.log(`Scheduled cleanup completed: ${result.totalVersionsRemoved} versions removed, ${this.formatSize(result.totalStorageFreed)} freed`);
      
      this.updateNextRunTime();
      
    } catch (error) {
      console.error('Scheduled cleanup failed:', error);
      this.updateNextRunTime();
    }
  }

  updateNextRunTime() {
    if (this.isRunning) {
      this.nextRun = new Date(Date.now() + this.intervalMinutes * 60 * 1000);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      intervalMinutes: this.intervalMinutes,
      lastRun: this.lastRun?.toISOString() || null,
      nextRun: this.nextRun?.toISOString() || null,
      uptimeMs: this.isRunning && this.lastRun ? Date.now() - this.lastRun.getTime() : 0
    };
  }

  // Trigger manual cleanup
  async triggerManualCleanup() {
    console.log('Manual cleanup triggered');
    return await this.runCleanup();
  }

  // Helper method to format size
  formatSize(bytes) {
    if (bytes === 0) return '0B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
  }
}