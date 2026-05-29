const crypto = require('node:crypto');
const { runBidAnalysisTask } = require('./bidAnalysisTask.cjs');
const { runContentGenerationTask, runContinueContentGeneration } = require('./contentGenerationTask.cjs');
const { runOutlineGenerationTask } = require('./outlineGenerationTask.cjs');

const taskFields = {
  'bid-analysis': 'bidAnalysisTask',
  'outline-generation': 'outlineGenerationTask',
  'content-generation': 'contentGenerationTask',
};

function now() {
  return new Date().toISOString();
}

function createTask(type) {
  return {
    task_id: crypto.randomUUID(),
    type,
    status: 'running',
    progress: 0,
    logs: [],
    started_at: now(),
    updated_at: now(),
  };
}

function createTaskService({ aiService, workspaceStore, knowledgeBaseService }) {
  const subscribers = new Set();
  const activeTasks = new Map();

  // 清理之前可能卡死的任务（例如 app 崩溃或同步错误导致的 running 状态残留）
  (function cleanupStaleTasks() {
    const plan = workspaceStore.loadTechnicalPlan();
    if (!plan) return;
    for (const field of Object.values(taskFields)) {
      const task = plan[field];
      if (task?.status === 'running') {
        const cleaned = { ...task, status: 'error', error: '应用重启，上一轮任务未正常结束', updated_at: now() };
        workspaceStore.updateTechnicalPlan({ [field]: cleaned });
      }
    }
  }());

  function emit(task, technicalPlan) {
    const event = { task, technicalPlan };
    for (const webContents of subscribers) {
      if (!webContents.isDestroyed()) {
        webContents.send('tasks:event', event);
      }
    }
  }

  function subscribe(webContents) {
    subscribers.add(webContents);
    const technicalPlan = workspaceStore.loadTechnicalPlan();
    for (const task of activeTasks.values()) {
      if (!webContents.isDestroyed()) {
        webContents.send('tasks:event', { task, technicalPlan });
      }
    }
    webContents.once('destroyed', () => subscribers.delete(webContents));
  }

  function getTaskField(type) {
    return taskFields[type];
  }

  function startTask(type, payload, runner, initialPartial = {}) {
    const existingTask = activeTasks.get(type);
    if (existingTask?.status === 'running') {
      emit(existingTask, workspaceStore.loadTechnicalPlan());
      return existingTask;
    }

    const task = createTask(type);
    activeTasks.set(type, task);
    const taskField = getTaskField(type);
    let currentTask = task;

    const updateTask = (partial, technicalPlan) => {
      currentTask = {
        ...currentTask,
        ...partial,
        logs: partial.logs ? partial.logs : currentTask.logs,
        updated_at: now(),
      };
      activeTasks.set(type, currentTask);
      if (technicalPlan) emit(currentTask, technicalPlan);
      return currentTask;
    };

    const technicalPlan = workspaceStore.updateTechnicalPlan({ ...initialPartial, [taskField]: currentTask });
    emit(currentTask, technicalPlan);

    Promise.resolve().then(() => runner({ aiService, workspaceStore, knowledgeBaseService, updateTask, payload })).catch((error) => {
      const failedTask = updateTask({ status: 'error', error: error.message || '任务执行失败' });
      const nextPlan = workspaceStore.updateTechnicalPlan({ [taskField]: failedTask });
      emit(failedTask, nextPlan);
    }).finally(() => {
      activeTasks.delete(type);
    });

    return currentTask;
  }

  return {
    subscribe,
    startBidAnalysis(payload) {
      return startTask('bid-analysis', payload, runBidAnalysisTask);
    },
    startOutlineGeneration(payload) {
      return startTask('outline-generation', payload, runOutlineGenerationTask, {
        outlineMode: payload?.mode,
        referenceKnowledgeDocumentIds: Array.isArray(payload?.reference_knowledge_document_ids) ? payload.reference_knowledge_document_ids : [],
      });
    },
    startContentGeneration(payload) {
      return startTask('content-generation', payload, runContentGenerationTask);
    },
    continueContentGeneration(payload) {
      return startTask('content-generation', payload, runContinueContentGeneration);
    },
    getActiveTasks() {
      return Array.from(activeTasks.values());
    },
  };
}

module.exports = { createTaskService };
