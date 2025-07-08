import React, { useState, useEffect, useRef } from 'react';
import { useAppState } from '../state/AppStateContext';
import type { AgentStatus } from '../state/types';
import styles from './AgentStatusIndicator.module.css';

// --- Icon Components ---
const Spinner = () => <div className={styles.spinner}></div>;

const Checkmark = () => (
  <svg className={styles.icon} viewBox="0 0 52 52">
    <circle className={styles.checkmarkCircle} cx="26" cy="26" r="25" fill="none" />
    <path className={styles.checkmarkCheck} fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8" />
  </svg>
);

const ErrorIcon = () => (
  <svg className={styles.icon} viewBox="0 0 52 52">
    <circle className={styles.errorCircle} cx="26" cy="26" r="25" fill="none" />
    <path className={styles.errorX1} d="M16 16 36 36" fill="none" />
    <path className={styles.errorX2} d="M36 16 16 36" fill="none" />
  </svg>
);

const ToolIcon = () => (
    <svg className={styles.icon} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
    </svg>
);

// --- Log Entry Sub-Component ---
// This is a small, reusable component for displaying a single log line.
const LogEntry = ({ statusUpdate }: { statusUpdate: AgentStatus }) => {
    const getIcon = () => {
        switch (statusUpdate.status) {
            case 'COMPLETED': return <Checkmark />;
            case 'ERROR': case 'FAILED': case 'ABORTED': return <ErrorIcon />;
            case 'INVOKING_TOOL': return <ToolIcon />;
            default: return <Spinner />;
        }
    };

    return (
        <div className={styles.logEntry}>
            <div className={styles.logIcon}>{getIcon()}</div>
            <span className={styles.logMessage}>{statusUpdate.message}</span>
        </div>
    );
};


// --- Main Component ---
export const AgentStatusIndicator = () => {
    const { state, dispatch } = useAppState();
    const { agentStatus } = state;
    
    // Internal state for the component's UI
    const [isExpanded, setIsExpanded] = useState(false);
    const [log, setLog] = useState<AgentStatus[]>([]);
    
    // Refs to manage component logic without causing re-renders
    const lastStatusRef = useRef<AgentStatus | null>(null);
    const scrollableContainerRef = useRef<HTMLDivElement>(null);

    // Effect to manage the log history
    useEffect(() => {
        // When a new prompt is submitted, clear the old log and start fresh.
        if (agentStatus?.status === 'STARTED') {
            setLog([agentStatus]);
            lastStatusRef.current = agentStatus;
            setIsExpanded(false); // Start collapsed
            return;
        }

        // If a new, different status update arrives, add it to our internal log.
        if (agentStatus && agentStatus !== lastStatusRef.current) {
            setLog(prevLog => [...prevLog, agentStatus]);
            lastStatusRef.current = agentStatus;
        }
    }, [agentStatus]);

    // Effect to automatically scroll to the bottom when a new log entry is added.
    useEffect(() => {
        if (scrollableContainerRef.current) {
            scrollableContainerRef.current.scrollTop = scrollableContainerRef.current.scrollHeight;
        }
    }, [log]);

    // Click handler for the main body of the indicator to toggle history view
    const handleToggleExpand = () => {
        if (log.length > 1) { // Only allow expanding if there's history
            setIsExpanded(prev => !prev);
        }
    };
    
    // Click handler for the dedicated close button
    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent the toggle handler from firing
        dispatch({ type: 'CLEAR_AGENT_STATUS' });
        setLog([]);
        setIsExpanded(false);
    };
    
    // If the log is empty, we have nothing to show.
    if (log.length === 0) {
        return null;
    }
    
    const latestLog = log[log.length - 1];
    const containerClasses = `${styles.statusContainer} ${isExpanded ? styles.expanded : ''}`;

    return (
        <div className={containerClasses} onClick={handleToggleExpand}>
            <div className={styles.visibleContent}>
                <LogEntry statusUpdate={latestLog} />

                {/* Show the chevron only if there's history to expand */}
                {log.length > 1 && (
                    <div className={`${styles.chevron} ${isExpanded ? styles.chevronUp : ''}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </div>
                )}
                
                <button onClick={handleClose} className={styles.closeButton}>×</button>
            </div>
            
            <div ref={scrollableContainerRef} className={styles.scrollableHistory}>
                {/* Map over the entire log to render the history items */}
                {log.map((entry, index) => (
                    <div key={index} className={styles.historyItem}>
                        <LogEntry statusUpdate={entry} />
                    </div>
                ))}
            </div>
        </div>
    );
};