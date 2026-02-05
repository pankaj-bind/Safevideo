// Generate a consistent HSL color from a string
export const stringToColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Use HSL for better pastel/vibrant control
  // Hue: 0-360 based on hash
  // Saturation: 65-85% for vibrancy
  // Lightness: 60-70% for visibility on dark mode
  const h = Math.abs(hash % 360);
  const s = 70; 
  const l = 60;
  
  return `hsl(${h}, ${s}%, ${l}%)`;
};
