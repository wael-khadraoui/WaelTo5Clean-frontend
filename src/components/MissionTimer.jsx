import React, { useState, useEffect } from 'react';
import './MissionTimer.css';

export default function MissionTimer({ mission, maxMinutes, orangeThreshold = 20, redThreshold = 5 }) {
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isExceeded, setIsExceeded] = useState(false);
  const [timeTaken, setTimeTaken] = useState(null);

  useEffect(() => {
    if (!mission || !mission.createdAt || !maxMinutes) {
      setTimeRemaining(null);
      return;
    }

    // If mission is completed, show time taken
    if (mission.status === 'completed' && mission.completedAt) {
      const createdAt = new Date(mission.createdAt);
      const completedAt = new Date(mission.completedAt);
      const elapsedMs = completedAt - createdAt;
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      setTimeTaken(elapsedMinutes);
      setTimeRemaining(null);
      return;
    }

    // For active missions, show countdown
    const updateTimer = () => {
      const createdAt = new Date(mission.createdAt);
      const now = new Date();
      const elapsedMs = now - createdAt;
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      const remaining = maxMinutes - elapsedMinutes;

      if (remaining <= 0) {
        setIsExceeded(true);
        setTimeRemaining(Math.abs(remaining)); // Count up when exceeded
      } else {
        setIsExceeded(false);
        setTimeRemaining(remaining);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000); // Update every second

    return () => clearInterval(interval);
  }, [mission, maxMinutes]);

  if (timeTaken !== null) {
    // Show time taken for completed missions
    return (
      <div className="mission-timer timer-completed">
        <div className="timer-icon">⏱️</div>
        <div className="timer-time">{timeTaken}m</div>
      </div>
    );
  }

  if (timeRemaining === null || !maxMinutes) {
    return null;
  }

  const percentage = isExceeded ? 0 : (timeRemaining / maxMinutes) * 100;
  const isOrange = !isExceeded && percentage <= orangeThreshold && percentage > redThreshold;
  const isRed = !isExceeded && percentage <= redThreshold;
  const isExceededRed = isExceeded;

  return (
    <div className={`mission-timer ${isOrange ? 'timer-orange' : ''} ${isRed ? 'timer-red' : ''} ${isExceededRed ? 'timer-exceeded' : ''}`}>
      <div className="timer-icon">⏱️</div>
      <div className="timer-time">
        {isExceeded ? `+${timeRemaining}m` : `${timeRemaining}m`}
      </div>
    </div>
  );
}

