"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import styles from "./page.module.css";

interface Explanation {
  error: string;
  correction: string;
  reason: string;
}

interface AnalysisResult {
  original: string;
  corrected: string;
  explanations: Explanation[];
  overall_feedback: string;
}

type LoadingStep = "idle" | "uploading" | "ocr" | "grammar" | "done";
// "review" = 검토 중, "confirmed" = 검토 완료
type ResultPhase = "review" | "confirmed";

const LOADING_STEPS: { key: LoadingStep; label: string }[] = [
  { key: "uploading", label: "이미지 업로드 중..." },
  { key: "ocr", label: "손글씨 인식 중 (OCR)..." },
  { key: "grammar", label: "문법 분석 중..." },
  { key: "done", label: "완료!" },
];

const ENGLISH_LEVELS = [
  { value: "elementary", label: "초급 (미국 초등학생 수준)" },
  { value: "middle", label: "중급 (미국 중학생 수준)" },
  { value: "high", label: "고급 (미국 고등학생/대학생 수준)" },
  { value: "native", label: "최상급 (원어민 수준)" },
];


export default function Home() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<LoadingStep>("idle");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Review mode state
  const [englishLevel, setEnglishLevel] = useState<string>("middle");
  const [resultPhase, setResultPhase] = useState<ResultPhase>("review");
  const [editableOriginalText, setEditableOriginalText] = useState<string>("");
  // Set of indices the user has marked as INVALID (OCR 오인식)
  const [rejectedIndices, setRejectedIndices] = useState<Set<number>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const simulateLoadingSteps = useCallback(() => {
    const steps: LoadingStep[] = ["uploading", "ocr", "grammar"];
    let idx = 0;
    setLoadingStep(steps[0]);
    const advance = () => {
      idx++;
      if (idx < steps.length) {
        setLoadingStep(steps[idx]);
        stepTimerRef.current = setTimeout(advance, 1800);
      }
    };
    stepTimerRef.current = setTimeout(advance, 1200);
  }, []);

  useEffect(() => {
    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    };
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드 가능합니다.");
      return;
    }
    setError(null);
    setResult(null);
    setRejectedIndices(new Set());
    setResultPhase("review");
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleAnalyze = async () => {
    if (!imageFile) return;
    setIsLoading(true);
    setResult(null);
    setError(null);
    setRejectedIndices(new Set());
    setResultPhase("review");
    simulateLoadingSteps();

    try {
      const formData = new FormData();
      formData.append("image", imageFile);
      formData.append("level", englishLevel);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "분석에 실패했습니다.");

      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      setLoadingStep("done");

      setTimeout(() => {
        setResult(data);
        setEditableOriginalText(data.original);
        setIsLoading(false);
        setLoadingStep("idle");
      }, 400);
    } catch (err) {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      setIsLoading(false);
      setLoadingStep("idle");
    }
  };

  const handleReAnalyze = async () => {
    if (!editableOriginalText || editableOriginalText === result?.original) return;

    setIsLoading(true);
    setError(null);
    setLoadingStep("grammar");

    try {
      const res = await fetch("/api/analyze-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: editableOriginalText,
          level: englishLevel,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "재분석에 실패했습니다.");

      setLoadingStep("done");

      setTimeout(() => {
        setResult(data);
        setEditableOriginalText(data.original);
        setRejectedIndices(new Set());
        setIsLoading(false);
        setLoadingStep("idle");
      }, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      setIsLoading(false);
      setLoadingStep("idle");
    }
  };

  const handleReset = () => {
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setError(null);
    setLoadingStep("idle");
    setRejectedIndices(new Set());
    setResultPhase("review");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Toggle an explanation item rejected/accepted
  const toggleRejected = (idx: number) => {
    setRejectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  // Mark all as rejected
  const rejectAll = () => {
    if (!result) return;
    setRejectedIndices(new Set(result.explanations.map((_, i) => i)));
  };

  // Restore all
  const acceptAll = () => setRejectedIndices(new Set());

  // Confirm review → move to confirmed phase
  const handleConfirm = () => setResultPhase("confirmed");

  // Back to review
  const handleBackToReview = () => setResultPhase("review");

  const getStepStatus = (stepKey: LoadingStep) => {
    const currentIdx = LOADING_STEPS.findIndex((s) => s.key === loadingStep);
    const stepIdx = LOADING_STEPS.findIndex((s) => s.key === stepKey);
    if (loadingStep === "done" || stepIdx < currentIdx) return "done";
    if (stepKey === loadingStep) return "active";
    return "pending";
  };

  const confirmedExplanations =
    result?.explanations.filter((_, i) => !rejectedIndices.has(i)) ?? [];
  const rejectedExplanations =
    result?.explanations.filter((_, i) => rejectedIndices.has(i)) ?? [];

  const isReview = resultPhase === "review";
  const isConfirmed = resultPhase === "confirmed";

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>✍️</div>
          <span className={styles.logoText}>AI English Teacher</span>
        </div>
        <span className={styles.badge}>Gemini AI</span>
      </header>

      <main className={styles.main}>
        {/* Hero */}
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>
            영어 손글씨를 <span>AI가 첨삭</span>해드립니다
          </h1>
          <p className={styles.heroSubtitle}>
            손으로 쓴 영어 사진을 업로드하면 Gemini AI가 글씨를 읽고,
            <br />
            문법 오류를 찾아 원문·수정본·이유를 깔끔하게 정리해드립니다.
          </p>
        </div>

        {/* Upload Section */}
        <div className={styles.uploadSection}>
          {!imagePreview ? (
            <div
              id="dropzone"
              className={`${styles.dropzone} ${isDragOver ? styles.dropzoneDragOver : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              role="button"
              aria-label="이미지 업로드 영역"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
              }}
            >
              <span className={styles.dropzoneIcon}>{isDragOver ? "📂" : "📷"}</span>
              <p className={styles.dropzoneTitle}>
                {isDragOver ? "여기에 놓으세요!" : "사진을 드래그하거나 클릭하여 업로드"}
              </p>
              <p className={styles.dropzoneSubtitle}>영어 손글씨가 담긴 사진을 선택해주세요</p>
              <div className={styles.dropzoneFormats}>
                {["JPG", "PNG", "WEBP", "GIF"].map((fmt) => (
                  <span key={fmt} className={styles.formatTag}>{fmt}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.previewContainer}>
              <Image
                src={imagePreview}
                alt="업로드된 손글씨 사진"
                className={styles.previewImage}
                width={1200}
                height={600}
                style={{ objectFit: "contain", maxHeight: "400px", height: "auto" }}
                unoptimized
              />
              <div className={styles.previewOverlay}>
                <button
                  id="change-image-btn"
                  className={`${styles.previewBtn} ${styles.previewBtnSecondary}`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  🔄 사진 변경
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            id="image-file-input"
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleInputChange}
          />

          {imagePreview && (
            <div className={styles.analyzeOptions}>
              <div className={styles.levelSelector}>
                <label htmlFor="english-level-select" className={styles.levelLabel}>목표 영어 수준:</label>
                <select
                  id="english-level-select"
                  className={styles.levelSelect}
                  value={englishLevel}
                  onChange={(e) => setEnglishLevel(e.target.value)}
                  disabled={isLoading}
                >
                  {ENGLISH_LEVELS.map(level => (
                    <option key={level.value} value={level.value}>{level.label}</option>
                  ))}
                </select>
              </div>
              <button
                id="analyze-btn"
                className={styles.analyzeBtn}
                onClick={handleAnalyze}
                disabled={isLoading}
              >
                {isLoading ? "⏳ 분석 중..." : "✨ 문법 첨삭 시작하기"}
              </button>
            </div>
          )}
        </div>

        {/* Error Alert */}
        {error && (
          <div className={styles.errorAlert} role="alert">
            <span className={styles.errorAlertIcon}>⚠️</span>
            <div className={styles.errorAlertContent}>
              <p className={styles.errorAlertTitle}>오류가 발생했습니다</p>
              <p className={styles.errorAlertText}>{error}</p>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className={styles.loadingContainer} aria-live="polite">
            <div className={styles.loadingSpinner} />
            <p className={styles.loadingText}>Gemini AI가 분석하고 있습니다...</p>
            <div className={styles.loadingSteps}>
              {LOADING_STEPS.filter((s) => s.key !== "done").map((step) => {
                const status = getStepStatus(step.key);
                return (
                  <div
                    key={step.key}
                    className={`${styles.loadingStep} ${
                      status === "active" ? styles.active : status === "done" ? styles.done : ""
                    }`}
                  >
                    <span className={styles.stepDot} />
                    {status === "done" ? "✓ " : ""}
                    {step.label}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── RESULTS ─────────────────────────────── */}
        {result && !isLoading && (
          <div className={styles.results} id="results-section">

            {/* ══ REVIEW PHASE ══ */}
            {isReview && (
              <>
                {/* Review Banner */}
                <div className={styles.reviewBanner}>
                  <div className={styles.reviewBannerLeft}>
                    <span className={styles.reviewBannerIcon}>🔍</span>
                    <div>
                      <p className={styles.reviewBannerTitle}>OCR 검토 모드</p>
                      <p className={styles.reviewBannerDesc}>
                        AI가 잘못 인식한 항목을 토글하여 제거하세요. 확인이 끝나면 <strong>검토 완료</strong>를 눌러주세요.
                      </p>
                    </div>
                  </div>
                  <div className={styles.reviewBannerActions}>
                    <button className={styles.reviewQuickBtn} onClick={acceptAll}>전체 수락</button>
                    <button className={styles.reviewQuickBtn} onClick={rejectAll}>전체 제거</button>
                  </div>
                </div>

                {/* Original text (editable reference) */}
                <div className={`${styles.textCard} ${styles.textCardOriginal}`}>
                  <div className={styles.textCardHeader}>
                    <div className={`${styles.textCardIcon} ${styles.textCardIconOriginal}`}>✍️</div>
                    <span className={styles.textCardLabel}>원문 (OCR 인식 결과 수정 가능)</span>
                  </div>
                  <textarea
                    className={styles.editableTextArea}
                    value={editableOriginalText}
                    onChange={(e) => setEditableOriginalText(e.target.value)}
                    rows={4}
                  />
                  {editableOriginalText !== result.original && (
                    <div className={styles.reanalyzeActions}>
                      <button className={styles.reanalyzeBtn} onClick={handleReAnalyze} disabled={isLoading}>
                        {isLoading ? "⏳ 처리 중..." : "🔄 수정된 텍스트로 다시 리뷰하기"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Interactive correction items */}
                <div className={styles.explanationsSection}>
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionHeaderIcon}>📝</div>
                    <h3 className={styles.sectionHeaderTitle}>
                      교정 항목 검토
                      <span className={styles.reviewCount}>
                        {result.explanations.length - rejectedIndices.size}/{result.explanations.length} 수락됨
                      </span>
                    </h3>
                  </div>

                  {result.explanations.length === 0 ? (
                    <div className={styles.noErrors}>
                      <span className={styles.noErrorsIcon}>🎉</span>
                      <p className={styles.noErrorsTitle}>문법 오류가 없습니다!</p>
                      <p className={styles.noErrorsText}>훌륭한 영어 실력이에요.</p>
                    </div>
                  ) : (
                    <div className={styles.explanationsList}>
                      {result.explanations.map((item, idx) => {
                        const isRejected = rejectedIndices.has(idx);
                        return (
                          <div
                            key={idx}
                            className={`${styles.explanationItem} ${styles.reviewItem} ${isRejected ? styles.reviewItemRejected : styles.reviewItemAccepted}`}
                          >
                            {/* Toggle button */}
                            <button
                              className={`${styles.reviewToggle} ${isRejected ? styles.reviewToggleOff : styles.reviewToggleOn}`}
                              onClick={() => toggleRejected(idx)}
                              aria-label={isRejected ? "수락으로 변경" : "제거로 변경"}
                              title={isRejected ? "클릭하여 수락" : "클릭하여 OCR 오인식으로 제거"}
                            >
                              {isRejected ? "✕" : "✓"}
                            </button>

                            <div className={styles.explanationNum}
                              style={isRejected ? { opacity: 0.35 } : {}}>
                              {idx + 1}
                            </div>

                            <div className={`${styles.explanationContent} ${isRejected ? styles.rejectedContent : ""}`}>
                              <div className={styles.errorRow}>
                                <span className={styles.errorText}>{item.error}</span>
                                <span className={styles.arrowIcon}>→</span>
                                <span className={styles.correctionText}>{item.correction}</span>
                                {isRejected && (
                                  <span className={styles.rejectedBadge}>OCR 오인식</span>
                                )}
                              </div>
                              <p className={styles.reasonText}>{item.reason}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Confirm button */}
                {editableOriginalText === result.original && (
                  <button
                    id="confirm-review-btn"
                    className={styles.confirmBtn}
                    onClick={handleConfirm}
                  >
                    ✅ 검토 완료 ({result.explanations.length - rejectedIndices.size}개 항목 확정)
                  </button>
                )}
              </>
            )}

            {/* ══ CONFIRMED PHASE ══ */}
            {isConfirmed && (
              <>
                {/* Confirmed header */}
                <div className={styles.resultsHeader}>
                  <h2 className={styles.resultsTitle}>📋 최종 첨삭 결과</h2>
                  <div
                    className={styles.scoreChip}
                    style={
                      confirmedExplanations.length > 0
                        ? { background: "rgba(245,158,11,0.1)", color: "var(--accent-amber)", border: "1px solid rgba(245,158,11,0.2)" }
                        : { background: "rgba(16,185,129,0.1)", color: "var(--accent-emerald)", border: "1px solid rgba(16,185,129,0.2)" }
                    }
                  >
                    {confirmedExplanations.length > 0
                      ? `⚠️ ${confirmedExplanations.length}개 수정사항`
                      : "✅ 완벽한 문법"}
                  </div>
                  <div className={styles.confirmedActions}>
                    <button className={styles.resetBtn} onClick={handleBackToReview}>
                      ← 검토로 돌아가기
                    </button>
                    <button id="reset-btn" className={styles.resetBtn} onClick={handleReset}>
                      🔄 다시 시작
                    </button>
                  </div>
                </div>

                {/* If any items were rejected, show a summary chip */}
                {rejectedIndices.size > 0 && (
                  <div className={styles.rejectedSummary}>
                    <span>🗑️</span>
                    <span>
                      <strong>{rejectedIndices.size}개</strong> 항목이 OCR 오인식으로 제거되었습니다.
                    </span>
                    <button className={styles.rejectedSummaryLink} onClick={handleBackToReview}>
                      다시 검토
                    </button>
                  </div>
                )}

                {/* Original vs Corrected */}
                <div className={styles.comparisonGrid}>
                  <div className={`${styles.textCard} ${styles.textCardOriginal}`}>
                    <div className={styles.textCardHeader}>
                      <div className={`${styles.textCardIcon} ${styles.textCardIconOriginal}`}>✍️</div>
                      <span className={styles.textCardLabel}>원문 (OCR)</span>
                    </div>
                    <p className={styles.textCardContent}>{result.original}</p>
                  </div>

                  <div className={`${styles.textCard} ${styles.textCardCorrected}`}>
                    <div className={styles.textCardHeader}>
                      <div className={`${styles.textCardIcon} ${styles.textCardIconCorrected}`}>✅</div>
                      <span className={styles.textCardLabel}>수정본</span>
                    </div>
                    <p className={styles.textCardContent}>{result.corrected}</p>
                  </div>
                </div>

                {/* Confirmed explanations */}
                <div className={styles.explanationsSection}>
                  <div className={styles.sectionHeader}>
                    <div className={styles.sectionHeaderIcon}>📖</div>
                    <h3 className={styles.sectionHeaderTitle}>
                      수정 이유 {confirmedExplanations.length > 0 ? `(${confirmedExplanations.length}개)` : ""}
                    </h3>
                  </div>

                  {confirmedExplanations.length > 0 ? (
                    <div className={styles.explanationsList}>
                      {confirmedExplanations.map((item, idx) => (
                        <div key={idx} className={styles.explanationItem}>
                          <div className={styles.explanationNum}>{idx + 1}</div>
                          <div className={styles.explanationContent}>
                            <div className={styles.errorRow}>
                              <span className={styles.errorText}>{item.error}</span>
                              <span className={styles.arrowIcon}>→</span>
                              <span className={styles.correctionText}>{item.correction}</span>
                            </div>
                            <p className={styles.reasonText}>{item.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.noErrors}>
                      <span className={styles.noErrorsIcon}>🎉</span>
                      <p className={styles.noErrorsTitle}>확정된 문법 오류가 없습니다!</p>
                      <p className={styles.noErrorsText}>
                        {rejectedIndices.size > 0
                          ? "모든 항목이 OCR 오인식으로 제거되었습니다."
                          : "훌륭한 영어 실력이에요."}
                      </p>
                    </div>
                  )}
                </div>

                {/* Rejected items (collapsed view) */}
                {rejectedExplanations.length > 0 && (
                  <details className={styles.rejectedDetails}>
                    <summary className={styles.rejectedDetailsSummary}>
                      🗑️ 제거된 항목 ({rejectedExplanations.length}개) 보기
                    </summary>
                    <div className={styles.rejectedList}>
                      {rejectedExplanations.map((item, idx) => (
                        <div key={idx} className={`${styles.explanationItem} ${styles.rejectedListItem}`}>
                          <div className={styles.explanationNum} style={{ opacity: 0.4 }}>✕</div>
                          <div className={`${styles.explanationContent} ${styles.rejectedContent}`}>
                            <div className={styles.errorRow}>
                              <span className={styles.errorText}>{item.error}</span>
                              <span className={styles.arrowIcon}>→</span>
                              <span className={styles.correctionText}>{item.correction}</span>
                              <span className={styles.rejectedBadge}>OCR 오인식</span>
                            </div>
                            <p className={styles.reasonText}>{item.reason}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* Overall Feedback */}
                <div className={styles.feedbackCard}>
                  <span className={styles.feedbackIcon}>💬</span>
                  <div className={styles.feedbackContent}>
                    <span className={styles.feedbackLabel}>선생님 총평</span>
                    <p className={styles.feedbackText}>{result.overall_feedback}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <p>
          Powered by{" "}
          <a href="https://deepmind.google/technologies/gemini/" target="_blank" rel="noopener noreferrer">
            Google Gemini AI
          </a>{" "}
          · AI English Teacher
        </p>
      </footer>
    </div>
  );
}
