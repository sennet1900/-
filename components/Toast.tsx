
import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'error';
  onClose: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose, duration }) => {
  // Logic: If duration is not manually provided:
  // Errors stay for 6 seconds (6000ms)
  // Normal messages (info/success) stay for 1.5 seconds (1500ms)
  const autoDuration = duration || (type === 'error' ? 6000 : 1500);

  useEffect(() => {
    const timer = setTimeout(onClose, autoDuration);
    return () => clearTimeout(timer);
  }, [autoDuration, onClose]);

  const bgColors = {
    info: 'bg-stone-800',
    success: 'bg-green-600',
    error: 'bg-red-600'
  };

  const icons = {
    info: 'fa-circle-info',
    success: 'fa-circle-check',
    error: 'fa-circle-exclamation'
  };

  return (
    <div 
      onClick={onClose}
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-6 py-3 rounded-full shadow-2xl text-white animate-slideDown cursor-pointer hover:scale-105 transition-transform ${bgColors[type]}`}
      title="点击关闭"
    >
      <i className={`fa-solid ${icons[type]}`}></i>
      <span className="text-sm font-bold">{message}</span>
    </div>
  );
};

export default Toast;
