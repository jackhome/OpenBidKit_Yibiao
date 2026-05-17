import { useEffect, useState } from 'react';
import { requestRejectionCheck } from '../services/rejectionCheckService';
import { useToast } from '../../../shared/ui';
import type { RejectionCheckReport } from '../types';

type PageStatus = 'idle' | 'loading' | 'success' | 'error';

const severityConfig = {
  high: { label: '高风险', color: '#E53E3E', bg: '#FFF5F5', border: '#FED7D7', icon: '🔴' },
  medium: { label: '中风险', color: '#DD6B20', bg: '#FFFAF0', border: '#FEEBC8', icon: '🟡' },
  low: { label: '低风险', color: '#718096', bg: '#F7FAFC', border: '#E2E8F0', icon: '⚪' },
};

const STORAGE_KEY_BID = 'rejection-check:bidContent';
const STORAGE_KEY_TENDER = 'rejection-check:tenderContent';
const STORAGE_KEY_RESULT = 'rejection-check:result';

function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function saveDraft<T>(key: string, value: T | null | undefined) {
  try {
    if (value != null) {
      localStorage.setItem(key, JSON.stringify(value));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // 存储满或不可用时静默失败
  }
}

function clearDrafts() {
  try {
    localStorage.removeItem(STORAGE_KEY_BID);
    localStorage.removeItem(STORAGE_KEY_TENDER);
    localStorage.removeItem(STORAGE_KEY_RESULT);
  } catch {
    // 静默失败
  }
}

interface PersistedResult {
  status: 'success' | 'error';
  report: RejectionCheckReport | null;
  error: string | null;
  checked_at: string;
}

function loadResult(): PersistedResult | null {
  return loadDraft<PersistedResult>(STORAGE_KEY_RESULT);
}

function loadString(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function RejectionCheckPage() {
  const [bidContent, setBidContent] = useState(() => loadString(STORAGE_KEY_BID));
  const [tenderContent, setTenderContent] = useState(() => loadString(STORAGE_KEY_TENDER));
  const [status, setStatus] = useState<PageStatus>(() => {
    const saved = loadResult();
    return saved?.status || 'idle';
  });
  const [report, setReport] = useState<RejectionCheckReport | null>(() => {
    const saved = loadResult();
    return saved?.report || null;
  });
  const [error, setError] = useState<string | null>(() => {
    const saved = loadResult();
    return saved?.error || null;
  });
  const [checkedAt, setCheckedAt] = useState<string>(() => {
    const saved = loadResult();
    return saved?.checked_at || '';
  });
  const [expandedRisks, setExpandedRisks] = useState<Set<string>>(new Set());
  const [importingPlan, setImportingPlan] = useState(false);
  const [uploadingBid, setUploadingBid] = useState(false);
  const [uploadingTender, setUploadingTender] = useState(false);
  const [loadingTender, setLoadingTender] = useState(true);
  const { showToast } = useToast();

  const hasBidContent = bidContent.trim().length > 0;
  const isChecking = status === 'loading';
  const hasResult = status === 'success' && report;
  const hasError = status === 'error' && error;

  // 页面加载时尝试从技术方案自动加载招标文件内容（仅首次无草稿时）
  useEffect(() => {
    let cancelled = false;

    const loadTenderFromPlan = async () => {
      // 如果已有用户草稿（之前保存过），不再覆盖
      if (loadDraft(STORAGE_KEY_TENDER)) {
        if (!cancelled) setLoadingTender(false);
        return;
      }

      try {
        setLoadingTender(true);
        const plan = await window.yibiao?.workspace.loadTechnicalPlan<{
          fileContent?: string;
        }>();

        if (cancelled) return;

        if (plan?.fileContent?.trim()) {
          const content = plan.fileContent.trim();
          setTenderContent(content);
          saveDraft(STORAGE_KEY_TENDER, content);
        }
      } catch {
        // 静默失败，不影响用户手动粘贴
      } finally {
        if (!cancelled) setLoadingTender(false);
      }
    };

    void loadTenderFromPlan();
    return () => { cancelled = true; };
  }, []);

  // 内容变更时自动持久化到 localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_BID, bidContent);
  }, [bidContent]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_TENDER, tenderContent);
  }, [tenderContent]);

  // 结果变更时自动持久化
  useEffect(() => {
    if (status === 'success' || status === 'error') {
      saveDraft(STORAGE_KEY_RESULT, { status, report, error });
    }
  }, [status, report, error]);

  const handleUploadBidFile = async () => {
    try {
      setUploadingBid(true);
      const result = await window.yibiao?.file.importDocument();
      if (!result?.success || !result.file_content) {
        showToast(result?.message || '未选择文件或解析失败', 'info');
        return;
      }
      setBidContent(result.file_content.trim());
      if (status !== 'idle') {
        setStatus('idle');
        setReport(null);
        setError(null);
      }
      showToast(`已解析文件：${result.file_name || ''}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '文件上传失败', 'error');
    } finally {
      setUploadingBid(false);
    }
  };

  const handleUploadTenderFile = async () => {
    try {
      setUploadingTender(true);
      const result = await window.yibiao?.file.importDocument();
      if (!result?.success || !result.file_content) {
        showToast(result?.message || '未选择文件或解析失败', 'info');
        return;
      }
      setTenderContent(result.file_content.trim());
      saveDraft(STORAGE_KEY_TENDER, result.file_content.trim());
      showToast(`已解析文件：${result.file_name || ''}`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '文件上传失败', 'error');
    } finally {
      setUploadingTender(false);
    }
  };

  const handleImportBidFromPlan = async () => {
    try {
      setImportingPlan(true);
      const plan = await window.yibiao?.workspace.loadTechnicalPlan<{
        outlineData?: { children?: Array<{ title?: string; content?: string; children?: unknown[] }> };
      }>();
      if (!plan?.outlineData?.children?.length) {
        showToast('当前技术方案没有内容可导入', 'info');
        return;
      }

      const extractContent = (items: Array<{ title?: string; content?: string; children?: unknown[] }>, depth = 0): string => {
        let result = '';
        for (const item of items) {
          if (item.title) result += `${'#'.repeat(Math.min(depth + 1, 6))} ${item.title}\n\n`;
          if (item.content) result += `${item.content}\n\n`;
          if (item.children?.length) result += extractContent(item.children as typeof items, depth + 1);
        }
        return result;
      };

      const content = extractContent(plan.outlineData.children as typeof plan.outlineData.children);
      if (!content.trim()) {
        showToast('当前技术方案没有可导入的正文内容', 'info');
        return;
      }
      setBidContent(content.trim());
      if (status !== 'idle') {
        setStatus('idle');
        setReport(null);
        setError(null);
      }
      showToast('已从技术方案导入标书内容', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : '导入失败', 'error');
    } finally {
      setImportingPlan(false);
    }
  };

  const handleClear = () => {
    setBidContent('');
    setTenderContent('');
    setStatus('idle');
    setReport(null);
    setError(null);
    setExpandedRisks(new Set());
    clearDrafts();
  };

  const handleCheck = async () => {
    if (!hasBidContent) return;

    try {
      setStatus('loading');
      setError(null);
      setReport(null);
      setExpandedRisks(new Set());

      const result = await requestRejectionCheck(bidContent, tenderContent || undefined);
      const checkedAt = new Date().toISOString();
      setCheckedAt(checkedAt);
      setReport(result);
      setStatus('success');
      // 直接写入存储，组件卸载后重新挂载时从存储恢复
      saveDraft(STORAGE_KEY_RESULT, { status: 'success' as const, report: result, error: null, checked_at: checkedAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : '检查失败，请重试';
      const checkedAt = new Date().toISOString();
      setCheckedAt(checkedAt);
      setError(message);
      setStatus('error');
      saveDraft(STORAGE_KEY_RESULT, { status: 'error' as const, report: null, error: message, checked_at: checkedAt });
    }
  };

  const handleRetry = () => {
    if (!hasBidContent) {
      showToast('请先填写或上传标书正文', 'info');
      return;
    }
    saveDraft(STORAGE_KEY_RESULT, null);
    setExpandedRisks(new Set());
    void handleCheck();
  };

  const toggleRiskExpand = (riskId: string) => {
    setExpandedRisks((prev) => {
      const next = new Set(prev);
      if (next.has(riskId)) {
        next.delete(riskId);
      } else {
        next.add(riskId);
      }
      return next;
    });
  };

  const severityCount = (severity: 'high' | 'medium' | 'low'): number => {
    if (!report) return 0;
    return report.risks.filter((risk) => risk.severity === severity).length;
  };

  const renderRiskList = () => {
    if (!report) return null;

    const highCount = severityCount('high');
    const mediumCount = severityCount('medium');
    const lowCount = severityCount('low');
    const total = report.risks.length;

    const sorted = [...report.risks].sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.severity] - order[b.severity];
    });

    return (
      <section className="panel rejection-risk-list">
        <div className="panel-heading">
          <span className="section-kicker">检查结果</span>
          {checkedAt && <span className="rejection-checked-at">{new Date(checkedAt).toLocaleString('zh-CN')}</span>}
          {total > 0 ? (
            <div className="rejection-result-inline">
              <strong className={`rejection-pass-badge ${report.passed ? 'is-passed' : 'is-failed'}`}>
                {report.passed ? '✅ 未发现废标风险' : '⚠️ 发现废标风险'}
              </strong>
              <div className="rejection-stat-list">
                <span className="rejection-stat high">高风险 {highCount} 项</span>
                <span className="rejection-stat medium">中风险 {mediumCount} 项</span>
                <span className="rejection-stat low">低风险 {lowCount} 项</span>
              </div>
              <button type="button" className="secondary-action" onClick={() => void handleRetry()}>重新检查</button>
            </div>
          ) : (
            <div className="rejection-result-inline">
              <strong className="rejection-pass-badge is-passed">✅ 未发现废标风险</strong>
              <button type="button" className="secondary-action" onClick={() => void handleRetry()}>检查其他内容</button>
            </div>
          )}
          <h3>共发现 {total} 项风险</h3>
        </div>
        {sorted.map((risk) => {
          const config = severityConfig[risk.severity];
          const isExpanded = expandedRisks.has(risk.id);
          return (
            <article
              key={risk.id}
              className="rejection-risk-card"
              style={{ borderLeftColor: config.color, background: config.bg }}
            >
              <button
                type="button"
                className="rejection-risk-header"
                onClick={() => toggleRiskExpand(risk.id)}
              >
                <span className="rejection-risk-severity" style={{ color: config.color }}>
                  {config.icon} {config.label}
                </span>
                <strong className="rejection-risk-title">{risk.title}</strong>
                <span className="rejection-risk-toggle">{isExpanded ? '收起 ▲' : '展开 ▼'}</span>
              </button>
              {isExpanded && (
                <div className="rejection-risk-detail">
                  <div className="rejection-risk-field">
                    <span className="rejection-risk-field-label">来源</span>
                    <p>{risk.source}</p>
                  </div>
                  <div className="rejection-risk-field">
                    <span className="rejection-risk-field-label">建议</span>
                    <p>{risk.suggestion}</p>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </section>
    );
  };

  return (
    <div className="page-stack page-stack--rejection">
      <section className="rejection-hero">
        <div className="rejection-hero-copy">
          <span className="section-kicker">合规底线</span>
          <strong>废标项检查清单</strong>
          <p>优先呈现硬性条款、格式要求和响应完整性，让风险在提交前被明确看见。</p>
        </div>
        <div className="rejection-hero-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => void handleCheck()}
            disabled={!hasBidContent || isChecking}
          >
            {isChecking ? 'AI 正在检查废标风险...' : '开始检查'}
          </button>
        </div>
      </section>

      <div className="rejection-layout">
        {/* 招标文件要求 — 上面，从技术方案自动加载 */}
        <section className="panel rejection-input-panel">
          <div className="panel-heading">
            <span className="section-kicker">对照依据</span>
            <h3>招标文件要求</h3>
          </div>
          <p className="rejection-input-hint">
            AI 会以此为依据逐项核查标书。已从技术方案自动加载解析后的招标文件内容，你也可以手动修改或粘贴。
          </p>
          <textarea
            className="rejection-textarea"
            value={tenderContent}
            onChange={(e) => setTenderContent(e.target.value)}
            placeholder={loadingTender ? '正在加载招标文件内容...' : '在此粘贴或编辑招标文件要求...'}
            rows={8}
            disabled={isChecking}
          />
          <div className="rejection-input-actions">
            <button
              type="button"
              className="secondary-action"
              onClick={() => void handleUploadTenderFile()}
              disabled={uploadingTender || isChecking}
            >
              {uploadingTender ? '解析中...' : '上传招标文件'}
            </button>
            {tenderContent && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (window.confirm('确定清空招标文件内容吗？')) {
                    setTenderContent('');
                  }
                }}
                disabled={isChecking}
              >
                清空
              </button>
            )}
          </div>
          {loadingTender && <p className="rejection-loading-hint">正在从技术方案加载招标文件内容...</p>}
        </section>

        {/* 标书正文 — 下面，提供本地上传 */}
        <section className="panel rejection-input-panel">
          <div className="panel-heading">
            <span className="section-kicker">必填</span>
            <h3>标书正文</h3>
          </div>
          <p className="rejection-input-hint">导入你的投标文件，AI 将检查其中是否存在废标风险。</p>
          <textarea
            className="rejection-textarea"
            value={bidContent}
            onChange={(e) => {
              setBidContent(e.target.value);
              if (status !== 'idle') {
                setStatus('idle');
                setReport(null);
                setError(null);
              }
            }}
            placeholder="上传文件或粘贴标书正文..."
            rows={10}
            disabled={isChecking}
          />
          <div className="rejection-input-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => void handleUploadBidFile()}
              disabled={uploadingBid || isChecking}
            >
              {uploadingBid ? '解析中...' : '上传标书文件'}
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => void handleImportBidFromPlan()}
              disabled={importingPlan || isChecking}
            >
              {importingPlan ? '导入中...' : '从技术方案导入'}
            </button>
            {bidContent && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  if (window.confirm('确定清空标书正文吗？')) {
                    setBidContent('');
                    if (status !== 'idle') {
                      setStatus('idle');
                      setReport(null);
                      setError(null);
                    }
                  }
                }}
                disabled={isChecking}
              >
                清空
              </button>
            )}
          </div>
        </section>

        {isChecking && (
          <section className="panel rejection-loading-panel">
            <div className="rejection-loading-indicator">
              <span className="rejection-loading-spinner" />
              <strong>AI 正在分析标书风险...</strong>
              <p>正在逐项核查资格条件、签字盖章、工期交付、技术参数、商务条款等维度。</p>
            </div>
          </section>
        )}

        {hasResult && renderRiskList()}

        {hasError && (
          <section className="panel rejection-error-panel">
            <div className="rejection-error-content">
              <strong>检查失败</strong>
              <p>{error}</p>
              <button type="button" className="secondary-action" onClick={() => void handleRetry()}>重试</button>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}

export default RejectionCheckPage;
