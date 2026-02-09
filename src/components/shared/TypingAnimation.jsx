import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

/**
 * TypingAnimation - Displays text with a typing effect using Framer Motion
 * @param {Array<string>} texts - Array of texts to cycle through
 * @param {number} typingSpeed - Milliseconds per character (default: 100)
 * @param {number} pauseTime - Milliseconds to pause between texts (default: 2000)
 * @param {boolean} repeat - Whether to loop through texts (default: true)
 * @param {string} className - Tailwind classes to apply
 */
export default function TypingAnimation({
  texts = ['Type something...'],
  typingSpeed = 100,
  pauseTime = 2000,
  repeat = true,
  className = ''
}) {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    const currentText = texts[currentIndex];
    let timeout;

    if (isTyping) {
      // Typing phase
      if (displayText.length < currentText.length) {
        timeout = setTimeout(() => {
          setDisplayText(displayText + currentText[displayText.length]);
        }, typingSpeed);
      } else {
        // Finished typing, pause before erasing or moving to next
        timeout = setTimeout(() => {
          if (repeat) {
            setIsTyping(false);
          }
        }, pauseTime);
      }
    } else {
      // Erasing phase
      if (displayText.length > 0) {
        timeout = setTimeout(() => {
          setDisplayText(displayText.slice(0, -1));
        }, typingSpeed / 2); // Erase faster
      } else {
        // Move to next text
        setCurrentIndex((prev) => (prev + 1) % texts.length);
        setIsTyping(true);
      }
    }

    return () => clearTimeout(timeout);
  }, [displayText, currentIndex, isTyping, texts, typingSpeed, pauseTime, repeat]);

  return (
    <motion.span
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {displayText}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ repeat: Infinity, duration: 0.8 }}
        className="ml-1 inline-block w-0.5 h-8 bg-current"
      />
    </motion.span>
  );
}
