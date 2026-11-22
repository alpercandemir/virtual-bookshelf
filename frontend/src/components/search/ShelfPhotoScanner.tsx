import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  CheckSquare,
  Edit3,
  Image as ImageIcon,
  Loader2,
  Palette,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import {
  resolveSpineAppearance,
  type BookshelfDto,
  type ScanConfidence,
  type ScannedBookCandidate,
  type SearchBookResult,
  type ShelfScanResponse,
} from '@bookshelf/shared';
import { api, ApiError, getProxiedCoverUrl } from '../../api/client';
import { extractCoverPaletteFromUrl } from '../../utils/extractCoverPalette';
import {
  optimizeShelfPhoto,
  type OptimizedShelfPhoto,
} from '../../utils/optimizeShelfPhoto';
import { ProceduralCover } from '../bookshelf/ProceduralCover';

interface ShelfPhotoScannerProps {
  bookshelf: BookshelfDto;
  targetCompartmentId: string;
  ownedKeys: Set<string>;
  onAddBook: (
    payload: Parameters<typeof api.addBook>[0],
    options?: { silent?: boolean }
  ) => Promise<unknown>;
  onToast: (message: string, tone?: 'info' | 'success' | 'error') => void;
  onComplete: () => void;
}

interface ReviewItemState {
  candidate: ScannedBookCandidate;
  selected: boolean;
  /** Index into candidate.matches, or -1 for manual entry using detected title/author */
  selectedMatchIndex: number;
  editedTitle: string;
  editedAuthor: string;
  editingQuery: boolean;
  searching: boolean;
  shelved: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isCandidateOwned(
  item: ReviewItemState,
  ownedKeys: Set<string>
): boolean {
  const match =
    item.selectedMatchIndex >= 0
      ? item.candidate.matches[item.selectedMatchIndex]
      : undefined;

  if (match) {
    if (match.isbn && ownedKeys.has(`isbn:${match.isbn.replace(/[^0-9X]/gi, '')}`)) {
      return true;
    }
    if (ownedKeys.has(`pid:${match.providerBookId}`)) {
      return true;
    }
    if (ownedKeys.has(`title:${match.title.trim().toLowerCase()}`)) {
      return true;
    }
  }

  return ownedKeys.has(`title:${item.editedTitle.trim().toLowerCase()}`);
}

function ConfidenceBadge({ confidence }: { confidence: ScanConfidence }) {
  if (confidence === 'high') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/35 px-1.5 py-0.2 text-[9px] font-medium text-emerald-500">
        High
      </span>
    );
  }
  if (confidence === 'medium') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/35 px-1.5 py-0.2 text-[9px] font-medium text-amber-500">
        Check
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-rose-500/15 border border-rose-500/35 px-1.5 py-0.2 text-[9px] font-medium text-rose-400">
      Low
    </span>
  );
}

function ScannedBookThumbnail({
  title,
  authors,
  coverUrl,
  spineColorHex,
}: {
  title: string;
  authors: string[];
  coverUrl: string | null;
  spineColorHex: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const previewUrl = coverUrl ? coverUrl.replace(/-L\.jpg/i, '-M.jpg') : null;
  const proxied = getProxiedCoverUrl(previewUrl);

  const appearance = resolveSpineAppearance({
    id: title,
    title,
    authors,
    format: 'hardcover',
    overrides: spineColorHex ? { spineColor: spineColorHex } : undefined,
  });

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [proxied]);

  return (
    <div className="relative w-[44px] h-[66px] shrink-0 rounded overflow-hidden shadow-[0_4px_10px_rgba(0,0,0,0.4)] bg-[#231912]">
      <div className="relative z-0 w-full h-full isolate">
        <ProceduralCover
          title={title}
          authors={authors}
          appearance={appearance}
          compact
        />
      </div>
      {proxied && !failed && (
        <img
          src={proxied}
          alt={`Cover of ${title}`}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 z-20 w-full h-full object-cover transition-opacity duration-200 ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}

export function ShelfPhotoScanner({
  bookshelf,
  targetCompartmentId,
  ownedKeys,
  onAddBook,
  onToast,
  onComplete,
}: ShelfPhotoScannerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [statusLoading, setStatusLoading] = useState(true);
  const [scanEnabled, setScanEnabled] = useState(true);
  const [configuredModel, setConfiguredModel] = useState<string | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [optimizedPhoto, setOptimizedPhoto] = useState<OptimizedShelfPhoto | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ShelfScanResponse | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItemState[]>([]);

  const [usePhotoSpineColors, setUsePhotoSpineColors] = useState(false);
  const [overflowNextShelf, setOverflowNextShelf] = useState(true);
  const [shelvingProgress, setShelvingProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    let active = true;
    api
      .getShelfScanStatus()
      .then((res) => {
        if (!active) return;
        setScanEnabled(res.enabled);
        setConfiguredModel(res.model);
      })
      .catch(() => {
        if (!active) return;
        // Assume enabled and let actual scan endpoint report any server error
        setScanEnabled(true);
      })
      .finally(() => {
        if (active) setStatusLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleSelectFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setScanError('Please select a JPEG, PNG, or WebP photo of your bookshelf.');
      return;
    }

    setScanError(null);
    setScanResult(null);
    setReviewItems([]);
    setPreparingPhoto(true);

    try {
      const optimized = await optimizeShelfPhoto(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const nextUrl = URL.createObjectURL(optimized.file);
      setPreviewUrl(nextUrl);
      setOptimizedPhoto(optimized);
    } catch {
      setScanError('Could not read that image file. Please try another photo.');
    } finally {
      setPreparingPhoto(false);
    }
  };

  const handleAnalyze = async () => {
    if (!optimizedPhoto) return;
    setScanning(true);
    setScanError(null);
    try {
      const result = await api.scanShelfPhoto(optimizedPhoto.file);
      setScanResult(result);

      const initialItems: ReviewItemState[] = result.books.map((candidate) => {
        const defaultMatchIndex = candidate.matches.length > 0 ? 0 : -1;
        const draft: ReviewItemState = {
          candidate,
          selected: true,
          selectedMatchIndex: defaultMatchIndex,
          editedTitle: candidate.detectedTitle,
          editedAuthor: candidate.detectedAuthor ?? '',
          editingQuery: false,
          searching: false,
          shelved: false,
        };
        const alreadyOwned = isCandidateOwned(draft, ownedKeys);
        // Auto-select confident non-duplicate books; leave duplicates & low-confidence unmatched unchecked for review
        const shouldAutoSelect =
          !alreadyOwned &&
          (candidate.matches.length > 0 || candidate.confidence !== 'low');
        return {
          ...draft,
          selected: shouldAutoSelect,
        };
      });

      setReviewItems(initialItems);
    } catch (err) {
      setScanError(
        err instanceof ApiError
          ? err.message
          : 'Failed to analyze shelf photo. Please try again.'
      );
    } finally {
      setScanning(false);
    }
  };

  const handleReset = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setOptimizedPhoto(null);
    setScanResult(null);
    setReviewItems([]);
    setScanError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const updateItem = (
    scanId: string,
    updater: (prev: ReviewItemState) => ReviewItemState
  ) => {
    setReviewItems((prev) =>
      prev.map((item) => (item.candidate.scanId === scanId ? updater(item) : item))
    );
  };

  const handleReSearchItem = async (item: ReviewItemState) => {
    const query = [item.editedTitle.trim(), item.editedAuthor.trim()]
      .filter(Boolean)
      .join(' ');
    if (!query) return;

    updateItem(item.candidate.scanId, (prev) => ({ ...prev, searching: true }));
    try {
      const res = await api.searchBooks({ q: query, type: 'all', page: 1, limit: 4 });
      const freshMatches = res.items.slice(0, 3);
      updateItem(item.candidate.scanId, (prev) => ({
        ...prev,
        searching: false,
        editingQuery: false,
        selectedMatchIndex: freshMatches.length > 0 ? 0 : -1,
        selected: true,
        candidate: {
          ...prev.candidate,
          matchStatus: freshMatches.length > 0 ? 'matched' : 'unmatched',
          matches: freshMatches,
        },
      }));
    } catch {
      updateItem(item.candidate.scanId, (prev) => ({ ...prev, searching: false }));
      onToast('Could not re-search catalog right now.', 'error');
    }
  };

  const selectedItems = useMemo(
    () => reviewItems.filter((item) => item.selected && !item.shelved),
    [reviewItems]
  );

  const toggleAll = (checked: boolean) => {
    setReviewItems((prev) =>
      prev.map((item) => (item.shelved ? item : { ...item, selected: checked }))
    );
  };

  const handleShelveSelected = async () => {
    if (selectedItems.length === 0) return;

    const compartmentOrder = (() => {
      const allIds = bookshelf.compartments.map((c) => c.id);
      if (!targetCompartmentId || !allIds.includes(targetCompartmentId)) {
        return allIds;
      }
      const startIdx = allIds.indexOf(targetCompartmentId);
      return [...allIds.slice(startIdx), ...allIds.slice(0, startIdx)];
    })();

    let compCursor = 0;
    let addedCount = 0;
    let failedCount = 0;

    setShelvingProgress({ current: 0, total: selectedItems.length });

    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      setShelvingProgress({ current: i + 1, total: selectedItems.length });

      const activeMatch: SearchBookResult | undefined =
        item.selectedMatchIndex >= 0
          ? item.candidate.matches[item.selectedMatchIndex]
          : undefined;

      let visualOverrides: Parameters<typeof api.addBook>[0]['visualOverrides'];

      if (usePhotoSpineColors && item.candidate.spineColorHex) {
        visualOverrides = { spineColor: item.candidate.spineColorHex };
      } else if (activeMatch?.coverUrl) {
        const proxied = getProxiedCoverUrl(activeMatch.coverUrl);
        if (proxied) {
          const extracted = await extractCoverPaletteFromUrl(proxied);
          if (extracted) {
            visualOverrides = {
              spineColor: extracted.primary,
              secondaryColor: extracted.secondary,
              accentColor: extracted.accent,
              textColor: extracted.textColor,
            };
          }
        }
      } else if (item.candidate.spineColorHex) {
        visualOverrides = { spineColor: item.candidate.spineColorHex };
      }

      const bookPayload: Parameters<typeof api.addBook>[0]['book'] = activeMatch
        ? {
            provider: activeMatch.provider,
            providerBookId: activeMatch.providerBookId,
            isbn: activeMatch.isbn,
            title: activeMatch.title,
            subtitle: activeMatch.subtitle,
            authors: activeMatch.authors,
            publisher: activeMatch.publisher,
            publicationDate: activeMatch.publicationDate,
            pageCount: activeMatch.pageCount,
            coverUrl: activeMatch.coverUrl,
            description: activeMatch.description,
            categories: activeMatch.categories,
            language: activeMatch.language,
            format: activeMatch.physicalDimensions.format,
            ...(activeMatch.physicalDimensions.source === 'verified'
              ? {
                  heightMm: activeMatch.physicalDimensions.heightMm,
                  widthMm: activeMatch.physicalDimensions.widthMm,
                  thicknessMm: activeMatch.physicalDimensions.thicknessMm,
                  dimensionSource: 'verified' as const,
                }
              : {}),
          }
        : {
            provider: 'manual',
            title: item.editedTitle.trim() || item.candidate.detectedTitle,
            authors: item.editedAuthor
              .split(',')
              .map((a) => a.trim())
              .filter(Boolean),
            language: item.candidate.language,
            format: 'hardcover',
          };

      let placed = false;
      while (compCursor < compartmentOrder.length) {
        const compId = compartmentOrder[compCursor];
        try {
          await onAddBook(
            {
              compartmentId: compId,
              book: bookPayload,
              visualOverrides,
            },
            { silent: true }
          );
          placed = true;
          addedCount += 1;
          updateItem(item.candidate.scanId, (prev) => ({
            ...prev,
            shelved: true,
            selected: false,
          }));
          break;
        } catch (err) {
          if (
            err instanceof ApiError &&
            err.code === 'SHELF_FULL' &&
            overflowNextShelf &&
            compCursor + 1 < compartmentOrder.length
          ) {
            compCursor += 1;
            continue;
          }
          failedCount += 1;
          break;
        }
      }

      if (!placed && compCursor >= compartmentOrder.length) {
        failedCount += 1;
      }
    }

    setShelvingProgress(null);

    if (addedCount > 0 && failedCount === 0) {
      onToast(
        `Shelved ${addedCount} ${addedCount === 1 ? 'book' : 'books'} from your shelf photo!`,
        'success'
      );
      onComplete();
    } else if (addedCount > 0 && failedCount > 0) {
      onToast(
        `Shelved ${addedCount} books. ${failedCount} could not fit — try adding a shelf level.`,
        'info'
      );
    } else {
      onToast(
        'Could not shelve selected books. The target shelf may be full.',
        'error'
      );
    }
  };

  if (statusLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-10 ui-text-muted text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[#c89d54]" />
        Checking shelf scanner availability…
      </div>
    );
  }

  if (!scanEnabled) {
    return (
      <div className="flex-1 overflow-y-auto library-scroll p-6 sm:p-8 flex items-center justify-center">
        <div className="max-w-md text-center space-y-3 rounded-2xl border ui-surface-card p-6">
          <div className="w-11 h-11 rounded-full bg-[#cfa458]/15 border border-[#cfa458]/35 flex items-center justify-center mx-auto">
            <Camera className="w-5 h-5 text-[#c89d54]" />
          </div>
          <h3 className="font-display text-xl font-semibold ui-text-primary">
            Shelf Photo Scanning Not Configured
          </h3>
          <p className="text-xs ui-text-secondary leading-relaxed">
            Set <code className="px-1.5 py-0.5 rounded ui-surface-input border">GEMINI_API_KEY</code> on the server to analyze real bookshelf photos with Gemini Flash-Lite.
          </p>
        </div>
      </div>
    );
  }

  // Step 1 & 2: Upload / Preview / Analyzing
  if (!scanResult) {
    return (
      <div className="flex-1 overflow-y-auto library-scroll p-4 sm:p-6 space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          data-testid="shelf-photo-input"
          className="hidden"
          onChange={(e) => handleSelectFile(e.target.files?.[0])}
        />

        {scanError && (
          <div className="rounded-xl border border-red-400/35 bg-red-950/35 p-3.5 flex items-start gap-2.5 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{scanError}</span>
          </div>
        )}

        {!previewUrl ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              handleSelectFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            data-testid="shelf-photo-dropzone"
            className={`rounded-2xl border-2 border-dashed p-8 sm:p-10 text-center transition cursor-pointer ${
              dragActive
                ? 'border-[#cfa458] bg-[#cfa458]/10'
                : 'border-[#c9a15c]/30 hover:border-[#cfa458]/65 ui-surface-card'
            }`}
          >
            <div className="w-12 h-12 rounded-2xl bg-[#cfa458]/15 border border-[#cfa458]/35 flex items-center justify-center mx-auto mb-3">
              {preparingPhoto ? (
                <Loader2 className="w-6 h-6 text-[#c89d54] animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-[#c89d54]" />
              )}
            </div>
            <p className="font-display text-xl font-semibold ui-text-primary">
              Snap or drop a photo of your bookshelf
            </p>
            <p className="text-xs ui-text-secondary mt-1.5 max-w-md mx-auto">
              We&apos;ll read the book spines left-to-right using{' '}
              <span className="font-medium ui-text-primary">
                {configuredModel || 'Gemini Flash-Lite'}
              </span>
              , match editions in the catalog, and let you review before shelving.
            </p>

            <div className="mt-5 inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] text-[#1a1107] font-semibold text-xs px-4 py-2 shadow">
              <Upload className="w-3.5 h-3.5" />
              Choose Shelf Photo
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] ui-text-muted max-w-lg mx-auto text-left">
              <div className="rounded-lg border ui-surface-input px-2.5 py-2">
                <strong className="ui-text-secondary block">Straight-on angle</strong>
                Face the spines directly to minimize glare.
              </div>
              <div className="rounded-lg border ui-surface-input px-2.5 py-2">
                <strong className="ui-text-secondary block">1–2 rows per shot</strong>
                Closer shots make thin paperback titles crisp.
              </div>
              <div className="rounded-lg border ui-surface-input px-2.5 py-2">
                <strong className="ui-text-secondary block">Auto-optimized</strong>
                Photos are resized locally before upload.
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-2xl overflow-hidden border ui-surface-card bg-black/40">
              <img
                src={previewUrl}
                alt="Selected bookshelf preview"
                className="w-full max-h-[320px] object-contain mx-auto"
              />
              {scanning && (
                <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2.5 text-center px-4">
                  <Loader2 className="w-8 h-8 text-[#e2be74] animate-spin" />
                  <p className="font-display text-xl text-[#f6ead7]">
                    Reading book spines…
                  </p>
                  <p className="text-xs text-[#cbb698] max-w-xs">
                    Extracting titles left-to-right and matching editions against the book catalog.
                  </p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs ui-text-muted flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-[#c89d54]" />
                {optimizedPhoto && (
                  <span>
                    {optimizedPhoto.wasResized
                      ? `Optimized ${formatBytes(optimizedPhoto.originalBytes)} → ${formatBytes(optimizedPhoto.optimizedBytes)} (${optimizedPhoto.width}×${optimizedPhoto.height})`
                      : `Ready (${formatBytes(optimizedPhoto.optimizedBytes)})`}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={scanning}
                  onClick={handleReset}
                  className="rounded-lg border ui-surface-input px-3 py-2 text-xs ui-text-secondary hover:ui-text-primary transition cursor-pointer disabled:opacity-50"
                >
                  Change Photo
                </button>
                <button
                  type="button"
                  disabled={scanning}
                  data-testid="analyze-shelf-btn"
                  onClick={handleAnalyze}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] text-[#1a1107] font-semibold text-xs sm:text-sm px-4 py-2 shadow transition cursor-pointer disabled:opacity-50"
                >
                  {scanning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {scanning ? 'Analyzing…' : 'Analyze Shelf Photo'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Step 3: Interactive Review Checklist
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Compact Photo & Summary Strip */}
      <div className="px-4 sm:px-6 py-3 border-b ui-surface-header flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Scanned shelf"
              className="w-12 h-9 rounded-md object-cover border ui-surface-card shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-semibold ui-text-primary">
                {scanResult.detectedCount}{' '}
                {scanResult.detectedCount === 1 ? 'book' : 'books'} detected
              </span>
              <span className="text-[11px] ui-text-muted">
                · {scanResult.matchedCount} matched in catalog
              </span>
              {scanResult.cached && (
                <span className="rounded-full bg-[#cfa458]/15 border border-[#cfa458]/35 px-1.5 py-0.2 text-[9px] text-[#c89d54]">
                  Cached
                </span>
              )}
            </div>
            <p className="text-[11px] ui-text-muted truncate">
              Model: {scanResult.model} · Ordered left-to-right as on your shelf
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          disabled={Boolean(shelvingProgress)}
          className="inline-flex items-center gap-1.5 rounded-lg border ui-surface-input px-2.5 py-1.5 text-xs ui-text-secondary hover:ui-text-primary transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className="w-3 h-3" />
          New Photo
        </button>
      </div>

      {/* Review List Body */}
      <div className="flex-1 overflow-y-auto library-scroll p-4 sm:p-5 space-y-3">
        {scanResult.notice && reviewItems.length === 0 ? (
          <div className="rounded-xl border ui-surface-card p-6 text-center space-y-3">
            <p className="text-sm ui-text-primary font-medium">{scanResult.notice}</p>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#cfa458] text-[#1a1107] font-semibold text-xs px-3.5 py-2 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              Try Another Photo
            </button>
          </div>
        ) : (
          <>
            {scanResult.notice && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <p>{scanResult.notice}</p>
              </div>
            )}

            {/* Bulk Options Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleAll(true)}
                  className="text-[11px] text-[#c89d54] hover:underline cursor-pointer"
                >
                  Select all
                </button>
                <span className="ui-text-muted">·</span>
                <button
                  type="button"
                  onClick={() => toggleAll(false)}
                  className="text-[11px] ui-text-muted hover:ui-text-primary cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-[11px] ui-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usePhotoSpineColors}
                    onChange={(e) => setUsePhotoSpineColors(e.target.checked)}
                    className="accent-[#cfa458]"
                  />
                  <Palette className="w-3 h-3 text-[#c89d54]" />
                  Use photo spine colors
                </label>

                <label className="inline-flex items-center gap-1.5 text-[11px] ui-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={overflowNextShelf}
                    onChange={(e) => setOverflowNextShelf(e.target.checked)}
                    className="accent-[#cfa458]"
                  />
                  Overflow to next shelf if full
                </label>
              </div>
            </div>

            {/* Detected Book Cards */}
            <div className="space-y-2.5" data-testid="scanned-books-list">
              {reviewItems.map((item) => {
                const { candidate } = item;
                const activeMatch =
                  item.selectedMatchIndex >= 0
                    ? candidate.matches[item.selectedMatchIndex]
                    : undefined;
                const displayTitle = activeMatch?.title ?? item.editedTitle;
                const displayAuthors =
                  activeMatch?.authors ??
                  (item.editedAuthor
                    ? item.editedAuthor.split(',').map((a) => a.trim())
                    : []);
                const alreadyOwned = isCandidateOwned(item, ownedKeys);

                return (
                  <div
                    key={candidate.scanId}
                    data-testid={`scanned-book-${candidate.position}`}
                    className={`rounded-xl border p-3 transition ${
                      item.shelved
                        ? 'border-emerald-500/35 bg-emerald-950/15 opacity-75'
                        : item.selected
                          ? 'ui-surface-card border-[#cfa458]/50'
                          : 'ui-surface-card opacity-65'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Selection Checkbox */}
                      <button
                        type="button"
                        disabled={item.shelved || Boolean(shelvingProgress)}
                        aria-label={`Select ${displayTitle}`}
                        onClick={() =>
                          updateItem(candidate.scanId, (prev) => ({
                            ...prev,
                            selected: !prev.selected,
                          }))
                        }
                        className="mt-1 shrink-0 text-[#c89d54] cursor-pointer disabled:cursor-default"
                      >
                        {item.shelved ? (
                          <Check className="w-4 h-4 text-emerald-500" />
                        ) : item.selected ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4 ui-text-muted" />
                        )}
                      </button>

                      {/* Thumbnail */}
                      <ScannedBookThumbnail
                        title={displayTitle}
                        authors={displayAuthors}
                        coverUrl={activeMatch?.coverUrl ?? null}
                        spineColorHex={candidate.spineColorHex}
                      />

                      {/* Details & Match Controls */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-display text-base font-semibold ui-text-primary leading-tight truncate">
                              {displayTitle}
                            </h4>
                            <p className="text-xs text-[#c89d54] truncate">
                              {displayAuthors.length > 0
                                ? displayAuthors.join(', ')
                                : 'Unknown author'}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                            <span className="rounded ui-surface-input border px-1.5 py-0.2 text-[9px] ui-text-muted">
                              R{candidate.shelfRow} · #{candidate.position}
                            </span>
                            {candidate.spineColorHex && (
                              <span
                                title={`Detected spine color ${candidate.spineColorHex}`}
                                className="w-3 h-3 rounded-full border border-white/25 shrink-0"
                                style={{ backgroundColor: candidate.spineColorHex }}
                              />
                            )}
                            <ConfidenceBadge confidence={candidate.confidence} />
                            {alreadyOwned && !item.shelved && (
                              <span className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.2 text-[9px] font-medium text-amber-500">
                                In Library
                              </span>
                            )}
                            {item.shelved && (
                              <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/40 px-1.5 py-0.2 text-[9px] font-medium text-emerald-500">
                                Shelved
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Match Selector + Re-search Trigger */}
                        {!item.shelved && (
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <select
                              aria-label={`Choose catalog match for ${candidate.detectedTitle}`}
                              value={item.selectedMatchIndex}
                              onChange={(e) =>
                                updateItem(candidate.scanId, (prev) => ({
                                  ...prev,
                                  selectedMatchIndex: Number(e.target.value),
                                }))
                              }
                              className="flex-1 min-w-[160px] h-7 rounded ui-surface-input border px-2 text-[11px] truncate"
                            >
                              {candidate.matches.map((m, idx) => (
                                <option key={`${m.providerBookId}-${idx}`} value={idx}>
                                  {m.title}
                                  {m.authors[0] ? ` — ${m.authors[0]}` : ''}
                                  {m.publicationDate
                                    ? ` (${m.publicationDate.slice(0, 4)})`
                                    : ''}
                                </option>
                              ))}
                              <option value={-1}>
                                Use detected spine text (Manual entry)
                              </option>
                            </select>

                            <button
                              type="button"
                              onClick={() =>
                                updateItem(candidate.scanId, (prev) => ({
                                  ...prev,
                                  editingQuery: !prev.editingQuery,
                                }))
                              }
                              className="inline-flex items-center gap-1 rounded-md border ui-surface-input px-2 py-1 text-[11px] ui-text-secondary hover:ui-text-primary transition cursor-pointer shrink-0"
                            >
                              <Edit3 className="w-3 h-3" />
                              {item.editingQuery ? 'Close' : 'Fix / Re-search'}
                            </button>
                          </div>
                        )}

                        {/* Inline Re-search Editor (Zero Gemini tokens!) */}
                        {item.editingQuery && !item.shelved && (
                          <div className="pt-1.5 flex flex-col sm:flex-row gap-1.5">
                            <input
                              type="text"
                              value={item.editedTitle}
                              onChange={(e) =>
                                updateItem(candidate.scanId, (prev) => ({
                                  ...prev,
                                  editedTitle: e.target.value,
                                }))
                              }
                              placeholder="Book title"
                              className="flex-1 rounded ui-surface-input border px-2.5 py-1 text-xs"
                            />
                            <input
                              type="text"
                              value={item.editedAuthor}
                              onChange={(e) =>
                                updateItem(candidate.scanId, (prev) => ({
                                  ...prev,
                                  editedAuthor: e.target.value,
                                }))
                              }
                              placeholder="Author (optional)"
                              className="sm:w-40 rounded ui-surface-input border px-2.5 py-1 text-xs"
                            />
                            <button
                              type="button"
                              disabled={item.searching || !item.editedTitle.trim()}
                              onClick={() => handleReSearchItem(item)}
                              className="inline-flex items-center justify-center gap-1 rounded bg-[#cfa458] text-[#1a1107] font-semibold text-xs px-3 py-1 cursor-pointer disabled:opacity-50 shrink-0"
                            >
                              {item.searching ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Search className="w-3 h-3" />
                              )}
                              Match
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Sticky Footer Action Bar */}
      {reviewItems.length > 0 && (
        <div className="px-4 sm:px-6 py-3 border-t ui-surface-header flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs ui-text-secondary">
            {shelvingProgress
              ? `Shelving ${shelvingProgress.current} of ${shelvingProgress.total}…`
              : `${selectedItems.length} of ${reviewItems.length} selected to shelve`}
          </p>

          <button
            type="button"
            disabled={selectedItems.length === 0 || Boolean(shelvingProgress)}
            data-testid="shelve-scanned-books-btn"
            onClick={handleShelveSelected}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-b from-[#cfa458] to-[#a77a32] hover:from-[#dbb268] hover:to-[#b5873c] text-[#1a1107] font-semibold text-xs sm:text-sm px-4 py-2 shadow transition cursor-pointer disabled:opacity-50"
          >
            {shelvingProgress ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {shelvingProgress
              ? `Shelving (${shelvingProgress.current}/${shelvingProgress.total})…`
              : `Shelve ${selectedItems.length} ${selectedItems.length === 1 ? 'Book' : 'Books'}`}
          </button>
        </div>
      )}
    </div>
  );
}
