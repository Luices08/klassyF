import Image from '@tiptap/extension-image';
import { EditorContent, Extension, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { MAX_BYTES_CONTENIDO_HTML } from '../../lib/actividades';
import { ImageIcon, LinkIcon } from './icons';

const ANCHO_MAXIMO_IMAGEN = 1280;
const TIPOS_IMAGEN = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Reduce una imagen pegada o soltada: el servidor guarda el texto con las imágenes dentro, así que pesan lo menos posible. */
function reducirImagen(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const imagen = new window.Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      const escala = Math.min(1, ANCHO_MAXIMO_IMAGEN / imagen.naturalWidth);
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.max(1, Math.round(imagen.naturalWidth * escala));
      lienzo.height = Math.max(1, Math.round(imagen.naturalHeight * escala));
      const contexto = lienzo.getContext('2d');
      if (!contexto) return rechazar(new Error('No se pudo leer la imagen.'));
      contexto.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
      // Una captura con transparencia se queda en PNG; una foto pasa a WEBP/JPEG, que pesa mucho menos.
      resolver(archivo.type === 'image/png' && lienzo.width * lienzo.height < 400_000 ? lienzo.toDataURL('image/png') : lienzo.toDataURL('image/jpeg', 0.82));
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error('No se pudo leer la imagen.'));
    };
    imagen.src = url;
  });
}

interface BotonProps {
  titulo: string;
  activo?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function Boton({ titulo, activo, disabled, onClick, children }: BotonProps) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      aria-pressed={activo}
      disabled={disabled}
      // mouseDown evita que el editor pierda la selección antes de aplicar el formato.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-label transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        activo ? 'bg-primary-soft text-primary' : 'text-body hover:bg-soft'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * La letra capital: un párrafo puede llevar la clase `letra-capital`, y el CSS agranda su primera letra. Es solo presentación (un atributo del párrafo), no cambia el texto;
 * el servidor de noticias deja pasar únicamente esa clase.
 */
const LetraCapital = Extension.create({
  name: 'letraCapital',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          letraCapital: {
            default: false,
            parseHTML: (elemento) => elemento.classList.contains('letra-capital'),
            renderHTML: (atributos) => (atributos.letraCapital ? { class: 'letra-capital' } : {}),
          },
        },
      },
    ];
  },
});

interface EditorRicoProps {
  /** Modo editorial (noticias): suma el botón de cita editorial y el de letra capital, y da a las citas el estilo de periódico. Sin él, el editor es el de siempre. */
  editorial?: boolean;
  /** HTML del contenido. Se lee al montar y cada vez que cambia desde afuera (p. ej. al abrir otra actividad). */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Nombre accesible del campo. */
  etiqueta?: string;
}

/**
 * Editor de texto enriquecido (negrita, listas, enlaces, imágenes pegadas o soltadas). El HTML que produce siempre lo vuelve a
 * limpiar el servidor: aquí solo se cuida que quepa (`MAX_BYTES_CONTENIDO_HTML`) y que las imágenes pesen poco.
 */
export function EditorRico({ value, onChange, placeholder = 'Escribe aquí…', disabled, etiqueta = 'Contenido', editorial = false }: EditorRicoProps) {
  const [aviso, setAviso] = useState<string | null>(null);
  const bytes = useMemo(() => new Blob([value]).size, [value]);

  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }), Image.configure({ allowBase64: true }), ...(editorial ? [LetraCapital] : [])],
    content: value,
    editable: !disabled,
    editorProps: {
      attributes: { class: `ProseMirror contenido-rico${editorial ? ' contenido-editorial' : ''}`, 'aria-label': etiqueta },
      handlePaste: (_vista, evento) => {
        const imagenes = Array.from(evento.clipboardData?.files ?? []).filter((f) => TIPOS_IMAGEN.includes(f.type));
        if (imagenes.length === 0) return false;
        void insertarImagenes(imagenes);
        return true;
      },
      handleDrop: (_vista, evento) => {
        const imagenes = Array.from(evento.dataTransfer?.files ?? []).filter((f) => TIPOS_IMAGEN.includes(f.type));
        if (imagenes.length === 0) return false;
        evento.preventDefault();
        void insertarImagenes(imagenes);
        return true;
      },
    },
    onUpdate: ({ editor: actual }) => {
      const html = actual.isEmpty ? '' : actual.getHTML();
      onChange(html);
    },
  });

  async function insertarImagenes(archivos: File[]) {
    if (!editor) return;
    setAviso(null);
    for (const archivo of archivos) {
      try {
        const src = await reducirImagen(archivo);
        editor.chain().focus().setImage({ src, alt: archivo.name }).run();
      } catch {
        setAviso('No se pudo leer una de las imágenes.');
      }
    }
  }

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  // Si el valor cambia desde afuera (otra actividad, formulario reiniciado) el editor lo adopta; lo que el propio editor emite no.
  useEffect(() => {
    if (!editor) return;
    const actual = editor.isEmpty ? '' : editor.getHTML();
    if (value !== actual) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      negrita: e?.isActive('bold') ?? false,
      cursiva: e?.isActive('italic') ?? false,
      subrayado: e?.isActive('underline') ?? false,
      titulo: e?.isActive('heading', { level: 2 }) ?? false,
      viñetas: e?.isActive('bulletList') ?? false,
      numeracion: e?.isActive('orderedList') ?? false,
      enlace: e?.isActive('link') ?? false,
      cita: e?.isActive('blockquote') ?? false,
      capital: Boolean(e?.getAttributes('paragraph').letraCapital),
      vacio: e?.isEmpty ?? true,
    }),
  });

  function ponerEnlace() {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const direccion = window.prompt('Dirección del enlace (https://…)');
    if (!direccion) return;
    const limpia = /^https?:\/\//i.test(direccion.trim()) ? direccion.trim() : `https://${direccion.trim()}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href: limpia }).run();
  }

  const excedido = bytes > MAX_BYTES_CONTENIDO_HTML;

  return (
    <div className="space-y-1">
      <div className={`overflow-hidden rounded-xl border bg-surface ${excedido ? 'border-danger' : 'border-border'} ${disabled ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-soft px-2 py-1.5">
          <Boton titulo="Negrita" activo={estado?.negrita} disabled={disabled} onClick={() => editor?.chain().focus().toggleBold().run()}>
            <strong>B</strong>
          </Boton>
          <Boton titulo="Cursiva" activo={estado?.cursiva} disabled={disabled} onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <em>I</em>
          </Boton>
          <Boton titulo="Subrayado" activo={estado?.subrayado} disabled={disabled} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
            <span className="underline">U</span>
          </Boton>
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <Boton titulo="Subtítulo" activo={estado?.titulo} disabled={disabled} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
            H
          </Boton>
          <Boton titulo="Lista con viñetas" activo={estado?.viñetas} disabled={disabled} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            • Lista
          </Boton>
          <Boton titulo="Lista numerada" activo={estado?.numeracion} disabled={disabled} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            1. Lista
          </Boton>
          {editorial && (
            <>
              <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
              <Boton titulo="Cita editorial" activo={estado?.cita} disabled={disabled} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
                <span className="text-base font-bold leading-none">“</span>
              </Boton>
              <Boton
                titulo="Letra capital al inicio del párrafo"
                activo={estado?.capital}
                disabled={disabled}
                onClick={() => editor?.chain().focus().updateAttributes('paragraph', { letraCapital: !estado?.capital }).run()}
              >
                <span className="font-serif text-base font-bold leading-none">Aa</span>
              </Boton>
            </>
          )}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <Boton titulo={estado?.enlace ? 'Quitar enlace' : 'Agregar enlace'} activo={estado?.enlace} disabled={disabled} onClick={ponerEnlace}>
            <LinkIcon className="h-4 w-4" />
          </Boton>
          <label
            title="Insertar imagen"
            className={`inline-flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg px-2 text-body hover:bg-soft ${disabled ? 'pointer-events-none opacity-50' : ''}`}
          >
            <ImageIcon className="h-4 w-4" />
            <input
              type="file"
              accept={TIPOS_IMAGEN.join(',')}
              multiple
              className="hidden"
              aria-label="Insertar imagen"
              onChange={(e) => {
                void insertarImagenes(Array.from(e.target.files ?? []));
                e.target.value = '';
              }}
            />
          </label>
        </div>
        <div className="relative">
          {estado?.vacio && <span className="pointer-events-none absolute left-3 top-2 text-muted">{placeholder}</span>}
          <EditorContent editor={editor} />
        </div>
      </div>
      <p className={`text-xs ${excedido ? 'text-danger' : 'text-muted'}`}>
        {excedido
          ? 'El contenido es demasiado pesado para guardarse: quita o reduce algunas imágenes.'
          : 'Puedes pegar o arrastrar imágenes directamente en el texto.'}
        {aviso && ` ${aviso}`}
      </p>
    </div>
  );
}
