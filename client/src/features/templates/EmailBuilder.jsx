import { useState } from 'react';

const BLOCK_TYPES = [
  { type: 'heading',   label: 'Heading',   icon: 'type-h1' },
  { type: 'paragraph', label: 'Paragraph', icon: 'text-paragraph' },
  { type: 'image',     label: 'Image',     icon: 'image' },
  { type: 'button',    label: 'Button',    icon: 'hand-index-thumb' },
  { type: 'divider',   label: 'Divider',   icon: 'hr' },
  { type: 'spacer',    label: 'Spacer',    icon: 'arrows-vertical' },
];

const VARIABLES = ['name', 'email', 'company', 'mobile'];

let _bid = 1;
const uid = () => `blk${Date.now()}${_bid++}`;

function makeBlock(type) {
  switch (type) {
    case 'heading':   return { id: uid(), type, text: 'Heading text', align: 'left', size: 24, color: '#1e293b' };
    case 'paragraph': return { id: uid(), type, text: 'Write your message here…', align: 'left', size: 14, color: '#374151' };
    case 'image':     return { id: uid(), type, src: '', alt: '', width: 100 };
    case 'button':    return { id: uid(), type, text: 'Click Here', link: 'https://', color: '#4d50d8', align: 'center' };
    case 'divider':   return { id: uid(), type };
    case 'spacer':    return { id: uid(), type, height: 24 };
    default:          return { id: uid(), type };
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

// Compiles the block array into table-based HTML with inlined styles — Outlook and
// most email clients don't support flexbox/grid/div layout, so this deliberately
// avoids all of that in favor of <table>/<td> with inline `style`.
export function blocksToHtml(blocks) {
  const rows = (blocks || []).map((b) => {
    switch (b.type) {
      case 'heading':
        return `<tr><td style="padding:16px 24px 8px;font-family:Arial,Helvetica,sans-serif;font-size:${b.size}px;font-weight:700;color:${b.color};text-align:${b.align};">${escapeHtml(b.text).replace(/\n/g, '<br>')}</td></tr>`;
      case 'paragraph':
        return `<tr><td style="padding:8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:${b.size}px;line-height:1.6;color:${b.color};text-align:${b.align};">${escapeHtml(b.text).replace(/\n/g, '<br>')}</td></tr>`;
      case 'image':
        return `<tr><td style="padding:8px 24px;text-align:center;">${b.src ? `<img src="${escapeAttr(b.src)}" alt="${escapeAttr(b.alt)}" width="${b.width}%" style="max-width:${b.width}%;border:0;display:inline-block;" />` : ''}</td></tr>`;
      case 'button':
        return `<tr><td style="padding:16px 24px;text-align:${b.align};"><a href="${escapeAttr(b.link)}" style="background:${b.color};color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;">${escapeHtml(b.text)}</a></td></tr>`;
      case 'divider':
        return `<tr><td style="padding:8px 24px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" /></td></tr>`;
      case 'spacer':
        return `<tr><td style="height:${b.height}px;line-height:${b.height}px;font-size:1px;">&nbsp;</td></tr>`;
      default:
        return '';
    }
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">${rows}</table></td></tr></table>`;
}

function BlockPreview({ block }) {
  switch (block.type) {
    case 'heading':
      return <div style={{ padding: '16px 24px 8px', fontSize: block.size, fontWeight: 700, color: block.color, textAlign: block.align }}>{block.text || 'Heading text'}</div>;
    case 'paragraph':
      return <div style={{ padding: '8px 24px', fontSize: block.size, lineHeight: 1.6, color: block.color, textAlign: block.align, whiteSpace: 'pre-wrap' }}>{block.text || 'Paragraph text'}</div>;
    case 'image':
      return (
        <div style={{ padding: '8px 24px', textAlign: 'center' }}>
          {block.src
            ? <img src={block.src} alt={block.alt} style={{ maxWidth: `${block.width}%` }} />
            : <div style={{ padding: 30, background: '#f1f5f9', borderRadius: 6, color: '#94a3b8', fontSize: 12 }}><i className="bi bi-image me-1" />No image URL set</div>}
        </div>
      );
    case 'button':
      return (
        <div style={{ padding: '16px 24px', textAlign: block.align }}>
          <span style={{ background: block.color, color: '#fff', padding: '10px 24px', borderRadius: 6, fontWeight: 600, fontSize: 13, display: 'inline-block' }}>{block.text || 'Button'}</span>
        </div>
      );
    case 'divider':
      return <div style={{ padding: '8px 24px' }}><hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: 0 }} /></div>;
    case 'spacer':
      return <div style={{ height: block.height }} />;
    default:
      return null;
  }
}

function BlockConfig({ block, onChange, onInsertVariable }) {
  const label = { fontSize: 11, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 };
  const field = { marginBottom: 10 };
  const withVars = ['heading', 'paragraph'].includes(block.type);

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
        {block.type} block
      </div>

      {['heading', 'paragraph'].includes(block.type) && (
        <div style={field}>
          <label style={label}>Text</label>
          <textarea className="form-control form-control-sm" rows={block.type === 'heading' ? 2 : 4} value={block.text}
            onChange={(e) => onChange({ text: e.target.value })} />
        </div>
      )}

      {block.type === 'image' && (
        <>
          <div style={field}><label style={label}>Image URL</label>
            <input className="form-control form-control-sm" value={block.src} onChange={(e) => onChange({ src: e.target.value })} placeholder="https://…" /></div>
          <div style={field}><label style={label}>Alt text</label>
            <input className="form-control form-control-sm" value={block.alt} onChange={(e) => onChange({ alt: e.target.value })} /></div>
          <div style={field}><label style={label}>Width (%)</label>
            <input type="number" min={10} max={100} className="form-control form-control-sm" value={block.width} onChange={(e) => onChange({ width: Number(e.target.value) })} /></div>
        </>
      )}

      {block.type === 'button' && (
        <>
          <div style={field}><label style={label}>Button text</label>
            <input className="form-control form-control-sm" value={block.text} onChange={(e) => onChange({ text: e.target.value })} /></div>
          <div style={field}><label style={label}>Link URL</label>
            <input className="form-control form-control-sm" value={block.link} onChange={(e) => onChange({ link: e.target.value })} placeholder="https://…" /></div>
          <div style={field}><label style={label}>Color</label>
            <input type="color" className="form-control form-control-sm form-control-color" value={block.color} onChange={(e) => onChange({ color: e.target.value })} /></div>
        </>
      )}

      {block.type === 'spacer' && (
        <div style={field}><label style={label}>Height (px)</label>
          <input type="number" min={4} max={120} className="form-control form-control-sm" value={block.height} onChange={(e) => onChange({ height: Number(e.target.value) })} /></div>
      )}

      {['heading', 'paragraph', 'button'].includes(block.type) && (
        <div style={field}><label style={label}>Alignment</label>
          <select className="form-select form-select-sm" value={block.align} onChange={(e) => onChange({ align: e.target.value })}>
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </select>
        </div>
      )}

      {['heading', 'paragraph'].includes(block.type) && (
        <>
          <div style={field}><label style={label}>Text color</label>
            <input type="color" className="form-control form-control-sm form-control-color" value={block.color} onChange={(e) => onChange({ color: e.target.value })} /></div>
          <div style={field}><label style={label}>Font size (px)</label>
            <input type="number" min={10} max={48} className="form-control form-control-sm" value={block.size} onChange={(e) => onChange({ size: Number(e.target.value) })} /></div>
        </>
      )}

      {withVars && (
        <div style={field}>
          <label style={label}>Insert variable</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {VARIABLES.map((v) => (
              <button key={v} type="button" onClick={() => onInsertVariable(v)}
                style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#4d50d8', cursor: 'pointer' }}>
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmailBuilder({ blocks, onChange }) {
  const [selectedId, setSelectedId] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);

  const selected = blocks.find((b) => b.id === selectedId) || null;

  const addBlock = (type) => {
    const block = makeBlock(type);
    onChange([...blocks, block]);
    setSelectedId(block.id);
  };

  const updateBlock = (id, patch) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const deleteBlock = (id) => {
    onChange(blocks.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const handleDrop = (index) => {
    if (dragIndex === null || dragIndex === index) return;
    const next = [...blocks];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(index, 0, moved);
    onChange(next);
    setDragIndex(null);
  };

  const onPaletteDrop = (e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/emailblock');
    if (type) addBlock(type);
  };

  const insertVariable = (varName) => {
    if (!selected) return;
    updateBlock(selected.id, { text: `${selected.text || ''} {{${varName}}}` });
  };

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      {/* Palette */}
      <div style={{ width: 160, flexShrink: 0, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: '10px 8px', alignSelf: 'flex-start' }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, padding: '0 4px' }}>
          Add Block
        </div>
        {BLOCK_TYPES.map(({ type, label, icon }) => (
          <div
            key={type}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/emailblock', type)}
            onClick={() => addBlock(type)}
            role="button"
            tabIndex={0}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 6, cursor: 'grab', marginBottom: 2 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ width: 24, height: 24, borderRadius: 5, background: '#eef2ff', color: '#4d50d8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
              <i className={`bi bi-${icon}`} />
            </span>
            <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onPaletteDrop}
        style={{ flex: 1, background: '#f4f4f7', borderRadius: 10, border: '1px solid #e2e8f0', padding: 20, minHeight: 420, overflowY: 'auto' }}
      >
        <div style={{ maxWidth: 600, margin: '0 auto', background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {blocks.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Drag a block here, or click one on the left, to start building your email.
            </div>
          )}
          {blocks.map((b, i) => (
            <div
              key={b.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              onClick={() => setSelectedId(b.id)}
              style={{
                position: 'relative', cursor: 'pointer',
                outline: selectedId === b.id ? '2px solid #4d50d8' : '1px dashed transparent',
                outlineOffset: -1,
              }}
              onMouseEnter={(e) => { if (selectedId !== b.id) e.currentTarget.style.outline = '1px dashed #cbd5e1'; }}
              onMouseLeave={(e) => { if (selectedId !== b.id) e.currentTarget.style.outline = '1px dashed transparent'; }}
            >
              <BlockPreview block={b} />
              {selectedId === b.id && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteBlock(b.id); }}
                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 5, background: '#fff', border: '1px solid #e2e8f0', color: '#ef4444', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <i className="bi bi-trash3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Config panel */}
      <div style={{ width: 240, flexShrink: 0, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 14, alignSelf: 'flex-start' }}>
        {!selected
          ? <div style={{ fontSize: 12, color: '#94a3b8' }}>Select a block to edit its content.</div>
          : <BlockConfig block={selected} onChange={(patch) => updateBlock(selected.id, patch)} onInsertVariable={insertVariable} />}
      </div>
    </div>
  );
}
