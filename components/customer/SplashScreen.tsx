"use client";

import { useEffect, useState } from "react";

export function SplashScreen() {
  const [show, setShow] = useState(true);
  const [fade, setFade] = useState(false);

  useEffect(() => {
    // Check if we've already shown the splash screen in this session
    const hasSeenSplash = sessionStorage.getItem("hasSeenSplash");
    if (hasSeenSplash) {
      setShow(false);
      return;
    }

    // Start fading out CSS transition at 2.3 seconds
    const fadeTimer = setTimeout(() => {
      setFade(true);
    }, 2300);

    // Completely remove from DOM at 2.8 seconds
    const unmountTimer = setTimeout(() => {
      setShow(false);
      sessionStorage.setItem("hasSeenSplash", "true");
    }, 2800);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(unmountTimer);
    };
  }, []);

  if (!show) return null;

  const text = "don't miss this saturday";

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if (sessionStorage.getItem("hasSeenSplash")) {
              document.documentElement.classList.add("hide-splash");
            }
          `,
        }}
      />
      <style>{`
        .hide-splash #splash-screen {
          display: none !important;
        }
        @keyframes char-appear {
          0% { opacity: 0; transform: translateY(5px) scale(0.8); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .splash-char {
          opacity: 0;
          animation: char-appear 0.2s forwards;
        }
        .splash-cursor {
          animation: cursor-blink 0.8s infinite linear;
        }
      `}</style>
      
      <div 
        id="splash-screen" 
        className={`fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center font-sour-gummy px-4 transition-opacity duration-500 ease-in-out ${fade ? 'opacity-0' : 'opacity-100'}`}
      >
        <div className="text-center">
          <div className="text-lg sm:text-xl font-bold tracking-[0.1em] sm:tracking-[0.2em] flex flex-wrap justify-center items-center max-w-sm mx-auto leading-relaxed">
            {text.split("").map((char, index) => (
              <span
                key={index}
                className={`splash-char ${char === " " ? "w-4 sm:w-6" : ""}`}
                style={{ animationDelay: `${index * 0.08}s` }}
              >
                {char}
              </span>
            ))}
            <span className="inline-block w-[4px] sm:w-[6px] h-6 sm:h-8 bg-black ml-1 sm:ml-2 align-middle -mt-1 splash-cursor" />
          </div>
        </div>
      </div>
    </>
  );
}
