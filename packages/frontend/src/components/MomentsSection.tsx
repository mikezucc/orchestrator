import React, { useState } from 'react';
import { Camera, Plus } from 'lucide-react';
import { MomentCapture } from './MomentCapture';
import { MomentsList } from './MomentsList';
import { MomentDetail } from './MomentDetail';

interface MomentsSectionProps {
  vmId?: string;
  vmName?: string;
}

export const MomentsSection: React.FC<MomentsSectionProps> = ({ vmId, vmName }) => {
  const [showCapture, setShowCapture] = useState(false);
  const [selectedMomentId, setSelectedMomentId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleMomentCreated = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleMomentDeleted = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Camera className="w-6 h-6" />
            Moments
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Capture visual changes and associate them with git commits
          </p>
        </div>
        <button
          onClick={() => setShowCapture(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Capture Moment
        </button>
      </div>

      {/* Moments List */}
      <div key={refreshKey}>
        <MomentsList
          vmId={vmId}
          onSelectMoment={setSelectedMomentId}
        />
      </div>

      {/* Capture Modal */}
      {showCapture && (
        <MomentCapture
          vmId={vmId}
          vmName={vmName}
          onClose={() => setShowCapture(false)}
          onSuccess={handleMomentCreated}
        />
      )}

      {/* Detail Modal */}
      {selectedMomentId && (
        <MomentDetail
          momentId={selectedMomentId}
          onClose={() => setSelectedMomentId(null)}
          onDelete={handleMomentDeleted}
        />
      )}
    </div>
  );
};