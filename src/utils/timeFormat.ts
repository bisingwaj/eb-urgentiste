export const formatRelativeTime = (dateString?: string): string => {
  if (!dateString) return '--';
  const now = new Date();
  const past = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - past.getTime()) / 1000);

  if (diffInSeconds < 5) return 'maintenant';
  if (diffInSeconds < 60) return `il y a ${diffInSeconds} sec`;
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `il y a ${diffInMinutes} min`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `il y a ${diffInHours} h`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `il y a ${diffInDays} j`;
};

export const formatDetailedDateTime = (dateString?: string): string => {
  if (!dateString) return '--:--';
  const date = new Date(dateString);
  const now = new Date();
  
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  
  const isSameDay = 
    date.getDate() === now.getDate() && 
    date.getMonth() === now.getMonth() && 
    date.getFullYear() === now.getFullYear();
    
  if (isSameDay) {
    return timeStr;
  }
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  
  return `${timeStr} [${day}:${month}:${year}]`;
};
