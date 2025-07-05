export const vmCreationProgress = {
  generateTrackingId(): string {
    return `vm-creation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
};