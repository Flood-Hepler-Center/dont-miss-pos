"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function SplashScreen() {
  const [mounted, setMounted] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Check if we've already shown the splash screen in this session
    const hasSeenSplash = sessionStorage.getItem("hasSeenSplash");
    if (hasSeenSplash) {
      setShow(false);
      return;
    }

    // It hasn't been seen, so let's show it!
    setShow(true);

    // Hide splash screen after typing animation completes and rests
    const timer = setTimeout(() => {
      setShow(false);
      sessionStorage.setItem("hasSeenSplash", "true");
    }, 2800); // 2.8s total duration before fading out

    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return null;

  const text = "don't miss this saturday";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center font-sour-gummy px-4"
        >
          {/* Aesthetic minimalist container */}
          <div className="text-center">
            {/* The typewriter text */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 1 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.08, // Time between each letter appearance
                  },
                },
              }}
              className="text-lg sm:text-xl font-bold tracking-[0.1em] sm:tracking-[0.2em] flex flex-wrap justify-center items-center max-w-sm mx-auto leading-relaxed"
            >
              {text.split("").map((char, index) => (
                <motion.span
                  key={index}
                  variants={{
                    hidden: { opacity: 0, scale: 0.8 },
                    visible: { opacity: 1, scale: 1 },
                  }}
                  className={char === " " ? "w-4 sm:w-6" : ""} // Handling space characters
                >
                  {char}
                </motion.span>
              ))}
              {/* Blinking Cursor */}
              <motion.span
                animate={{ opacity: [1, 0, 1] }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  ease: "linear"
                }}
                className="inline-block w-[4px] sm:w-[6px] h-6 sm:h-8 bg-black ml-1 sm:ml-2 align-middle -mt-1"
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
