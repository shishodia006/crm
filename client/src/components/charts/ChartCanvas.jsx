import { useEffect, useRef } from 'react';

export default function ChartCanvas({ type, data, options = {}, height = 240 }) {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !window.Chart) return;
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    chartRef.current = new window.Chart(canvasRef.current, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
        ...options,
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  }, [type, data, options]);

  // Height must be on the WRAPPER div for maintainAspectRatio:false to work correctly
  return (
    <div className="position-relative" style={{ height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
