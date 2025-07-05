// parsec-frontend/src/presentation/PresentationView.tsx
import React, { useEffect, useMemo, useRef } from 'react';
import { useAppState } from '../state/AppStateContext';
import type { FrameElement } from '../state/types';
import { renderToStaticMarkup } from 'react-dom/server';
import { Stage, Layer, Group } from 'react-konva';
import { ElementRenderer } from '../canvas/elements/ElementRenderer';

// NEW: This component defines the static HTML shell of the presenter window.
// It is written only ONCE. It contains the all-important script that LISTENS for updates.
const PresenterShell: React.FC = () => {
    return (
        <html>
          <head>
            <title>Presenter View</title>
            <style>{`
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #1e1e1e; color: #eee; margin: 0; padding: 20px; display: flex; flex-direction: column; height: 100vh; box-sizing: border-box; }
              .grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr; gap: 20px; flex-grow: 1; }
              .card { background: #252627; border: 1px solid #444; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; }
              .card h2 { margin: 0 0 10px; font-size: 14px; color: #888; text-transform: uppercase; }
              .slide-preview { background: #333; flex-grow: 1; display: flex; align-items: center; justify-content: center; border-radius: 4px; font-size: 24px; font-weight: bold; text-align: center; padding: 5px; }
              .notes { white-space: pre-wrap; font-size: 14px; line-height: 1.5; overflow-y: auto; }
              .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-shrink: 0; }
              #timer { font-size: 24px; font-weight: bold; }
              button { background: #3a3d40; border: 1px solid #555; color: #ccc; padding: 8px 16px; border-radius: 4px; cursor: pointer; }
            `}</style>
          </head>
          <body>
            {/* The layout is static */}
            <div className="header"><div id="timer">00:00</div><button id="stopBtn">Stop Presenting</button></div>
            <div className="grid">
              <div className="card"><h2>Current Slide</h2><div className="slide-preview" id="current-slide-name"></div></div>
              <div className="card"><h2>Next Slide</h2><div className="slide-preview" id="next-slide-name"></div></div>
              <div className="card" style={{ gridColumn: 'span 2' }}><h2>Speaker Notes</h2><div className="notes" id="speaker-notes"></div></div>
            </div>

            {/* The script to handle everything runs once */}
            <script>{`
                const bc = new BroadcastChannel('parsec_presentation_sync');
                
                // This is the listener that updates the DOM when a message arrives
                bc.onmessage = (event) => {
                  if (event.data.type === 'update') {
                    const { payload } = event.data;
                    document.getElementById('current-slide-name').innerText = payload.currentSlideName;
                    document.getElementById('next-slide-name').innerText = payload.nextSlideName;
                    document.getElementById('next-slide-name').style.opacity = payload.hasNext ? 1 : 0.3;
                    document.getElementById('speaker-notes').innerText = payload.speakerNotes;
                  }
                };
                
                // This channel is for sending messages back to the main app
                const controlChannel = new BroadcastChannel('parsec_presentation_control');
                document.getElementById('stopBtn').onclick = () => controlChannel.postMessage({ type: 'stop' });
                
                let startTime = Date.now();
                const timer = setInterval(() => {
                  const elapsed = Date.now() - startTime;
                  const seconds = Math.floor((elapsed / 1000) % 60).toString().padStart(2, '0');
                  const minutes = Math.floor(elapsed / 1000 / 60).toString().padStart(2, '0');
                  const timerEl = document.getElementById('timer');
                  if (timerEl) timerEl.innerText = minutes + ':' + seconds;
                }, 1000);

                window.onbeforeunload = () => {
                    clearInterval(timer);
                    controlChannel.postMessage({ type: 'stop' });
                };
            `}</script>
          </body>
        </html>
    );
};


// --- Main Presentation View (for the audience) ---
export const PresentationView: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { elements, presentation } = state;

  const syncChannelRef = useRef<BroadcastChannel | null>(null);

  const slides = useMemo(() => {
    return Object.values(elements)
      .filter(el => el.element_type === 'frame' && el.presentationOrder !== null)
      .sort((a, b) => (a as FrameElement).presentationOrder! - (b as FrameElement).presentationOrder!) as FrameElement[];
  }, [elements]);

  const currentSlide = slides[presentation.currentSlideIndex];

  // This master useEffect handles the entire lifecycle of the presentation session.
  useEffect(() => {
    // --- 1. SETUP: This runs ONCE when the component mounts ---
    const presenterWindow = window.open('', '_blank', 'width=800,height=600,resizable=yes');
    if (!presenterWindow) {
        alert("Pop-up blocked! Please allow pop-ups for this site to use Presenter View.");
        dispatch({ type: 'STOP_PRESENTATION' });
        return;
    }

    // Write the static SHELL to the window ONCE.
    presenterWindow.document.write(renderToStaticMarkup(<PresenterShell />));
    presenterWindow.document.close();

    // This channel is for SENDING updates TO the presenter window.
    syncChannelRef.current = new BroadcastChannel('parsec_presentation_sync');

    // This channel is for RECEIVING control messages FROM the presenter window.
    const controlChannel = new BroadcastChannel('parsec_presentation_control');
    const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'stop') {
            dispatch({ type: 'STOP_PRESENTATION' });
        }
    };
    controlChannel.addEventListener('message', handleMessage);

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') dispatch({ type: 'NEXT_SLIDE' });
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') dispatch({ type: 'PREV_SLIDE' });
      if (e.key === 'Escape') dispatch({ type: 'STOP_PRESENTATION' });
    };
    window.addEventListener('keydown', handleKeyDown);

    // --- 2. TEARDOWN: This function runs ONCE when the component unmounts ---
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      controlChannel.close();
      syncChannelRef.current?.close();
      if (presenterWindow && !presenterWindow.closed) {
        presenterWindow.close();
      }
    };
  }, []); // The empty dependency array `[]` is crucial and correct.

  
  // This separate useEffect is now ONLY responsible for POSTING MESSAGES.
  useEffect(() => {
    const channel = syncChannelRef.current;
    if (!channel || !currentSlide) {
      return;
    }
    
    // Send the data payload. The script in the shell will handle the rest.
    const nextSlide = slides[presentation.currentSlideIndex + 1];
    channel.postMessage({
        type: 'update',
        payload: {
            currentSlideName: currentSlide.name || `Slide ${presentation.currentSlideIndex + 1}`,
            nextSlideName: nextSlide ? (nextSlide.name || `Slide ${presentation.currentSlideIndex + 2}`) : 'End of Show',
            hasNext: !!nextSlide,
            speakerNotes: currentSlide.speakerNotes || 'No notes for this slide.',
        },
    });

  }, [currentSlide, slides]); // Re-runs when the slide changes.


  return (
    <div style={{ position: 'fixed', inset: 0, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {!currentSlide ? (
        <div style={{ color: 'white', fontSize: '24px' }}>No slides to present. Press ESC to exit.</div>
      ) : (
        <Stage width={window.innerWidth} height={window.innerHeight}>
          <Layer>
            {(() => {
              const scale = Math.min(window.innerWidth / currentSlide.width, window.innerHeight / currentSlide.height) * 0.95;
              const x = (window.innerWidth - currentSlide.width * scale) / 2;
              const y = (window.innerHeight - currentSlide.height * scale) / 2;
              const slideChildren = Object.values(elements).filter(el => el.parentId === currentSlide.id);
              
              return (
                <Group x={x} y={y} scaleX={scale} scaleY={scale} width={currentSlide.width} height={currentSlide.height}>
                  <ElementRenderer element={currentSlide} />
                  {slideChildren.map(child => (
                    <ElementRenderer key={child.id} element={child} />
                  ))}
                </Group>
              );
            })()}
          </Layer>
        </Stage>
      )}
    </div>
  );
};