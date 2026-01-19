
import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'error';
  onClose: () => void;
  duration?: number;
}

const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose, duration = 3000 }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

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
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-6 py-3 rounded-full shadow-2xl text-white animate-slideDown ${bgColors[type]}`}>
      <i className={`fa-solid ${icons[type]}`}></i>
      <span className="text-sm font-bold">{message}</span>
    </div>
  );
};

export default Toast;
