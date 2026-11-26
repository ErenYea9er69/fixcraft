import React, { useState, useRef } from 'react';
import { api } from '../../services/client';
import { UploadCloud, X, Loader2, AlertCircle } from 'lucide-react';

// Props interface for diagnostic evidence image uploader
interface ImageUploadProps {
  images: string[];
  onChange: (urls: string[]) => void;
  maxFiles?: number;
  label?: string;
  helperText?: string;
}

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Multi-file image uploader with format/size validation and thumbnail removal
export const ImageUpload: React.FC<ImageUploadProps> = ({
  images,
  onChange,
  maxFiles = 4,
  label = 'Diagnostic Photos / Hardware Evidence',
  helperText = 'Upload clear photos showing model serials, cracks, water indicator or error screen (JPEG, PNG, WebP, GIF up to 10MB)',
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validates selected files against size and format limits and uploads via API
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);

    if (images.length + files.length > maxFiles) {
      setError(`You can only upload a maximum of ${maxFiles} images.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setError(null);
    setIsUploading(true);

    const uploadedUrls: string[] = [];
    const errors: string[] = [];

    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIME_TYPES.includes(file.type)) {
        errors.push(`"${file.name}" has an unsupported format. Allowed: JPG, PNG, WebP, GIF.`);
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        errors.push(`"${file.name}" exceeds the 10MB file size limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`);
        continue;
      }

      try {
        const res = await api.upload.uploadImage(file);
        if (res && res.url) {
          uploadedUrls.push(res.url);
        }
      } catch (err: any) {
        errors.push(`"${file.name}" upload failed: ${err.message || 'Server error'}`);
      }
    }

    if (uploadedUrls.length > 0) {
      onChange([...images, ...uploadedUrls]);
    }

    if (errors.length > 0) {
      setError(errors.join(' '));
    }

    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Removes an uploaded image thumbnail from the local collection
  const handleRemove = (index: number) => {
    const updated = images.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 tracking-wide uppercase">
          {label}
        </label>
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {images.length} / {maxFiles} photos
        </span>
      </div>

      {helperText && <p className="text-xs text-neutral-500 dark:text-neutral-400">{helperText}</p>}

      {error && (
        <div className="p-3 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-xs text-neutral-900 dark:text-neutral-100 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-neutral-800 dark:text-neutral-200 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Thumbnails grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        {images.map((url, idx) => (
          <div
            key={idx}
            className="relative group aspect-video rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900"
          >
            <img
              src={url}
              alt={`Proof evidence ${idx + 1}`}
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="absolute top-1.5 right-1.5 p-1.5 bg-black/75 hover:bg-black text-white rounded-full transition-colors opacity-90 group-hover:opacity-100 min-h-[32px] min-w-[32px] flex items-center justify-center"
              title="Remove image"
              aria-label="Remove image"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}

        {images.length < maxFiles && (
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="aspect-video rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-700 hover:border-black dark:hover:border-white hover:bg-neutral-50 dark:hover:bg-neutral-900 flex flex-col items-center justify-center text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-black dark:text-white" />
            ) : (
              <>
                <UploadCloud className="w-5 h-5 mb-1 text-neutral-700 dark:text-neutral-300" />
                <span className="text-xs font-medium">Add Photo</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
};
