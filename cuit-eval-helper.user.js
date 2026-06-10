// ==UserScript==
// @name         CUIT自动评教 CUIT Evaluation Helper
// @namespace    https://github.com/ShallowMaple/cuit-evaluation-helper
// @version      0.3.0
// @description  成都信息工程大学教务系统评教辅助工具：自动填写评教问卷，支持每题独立配置选项，一键批量完成所有教师评教。
// @author       ShallowMaple
// @match        *://*/eams/*
// @icon         https://www.cuit.edu.cn/favicon.ico
// @license      MIT
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ==================== 用户配置区 ====================
  const CONFIG = {
    // 文本框填写的内容
    textareaValue: '无',
    // 操作延迟（毫秒）
    delay: 800,
    // 题目选项配置（支持多种模式）
    questionConfig: {
      // 模式1：范围配置（适用于大多数题目）
      ranges: [
        { start: '1.1', end: '1.11', optionIndex: 0 },      // 1.1-1.11 选第一个选项
        { start: '1.12', end: '1.14', optionIndex: 2 },      // 1.12-1.14 选第三个选项
        { start: '2.1', end: '2.10', optionIndex: 0 }        // 2.1-2.10 选第一个选项
      ],
      // 模式2：单题精确配置（优先级高于 ranges）
      specific: {
        // '1.5': 1,      // 示例：1.5题选第二个选项
        // '2.3': 2       // 示例：2.3题选第三个选项
      },
      // 默认选项（当题目不在任何配置范围内时使用）
      defaultOptionIndex: 0
    }
  };
  // ==================================================

  const STORAGE_KEY = 'cuit_eval_helper_state_v9';
  let isRunning = false;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function log(msg, isError = false) {
    const prefix = isError ? '❌' : '✓';
    console.log(`[CUIT Eval] ${msg}`);
    const el = document.querySelector('#cuit-log-content');
    if (el) {
      el.innerHTML = `${prefix} ${msg}`;
      setTimeout(() => {
        if (el.innerHTML === `${prefix} ${msg}`) {
          el.innerHTML = '⚡ 就绪';
        }
      }, 3000);
    }
  }

  function trigger(el) {
    if (!el) return;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function isDetailPage() {
    const hasQuestions = document.querySelector('.qBox.objective, .question, [class*="question"]');
    const hasSubmit = [...document.querySelectorAll('button, input[type="submit"], a')].some(el => {
      const text = (el.innerText || el.value || '').trim();
      return text === '提交' || text === '提交评教' || text.includes('提交');
    });
    return hasQuestions && hasSubmit;
  }

  function isListPage() {
    const hasEvalLinks = [...document.querySelectorAll('a')].some(a =>
      (a.innerText || '').includes('评教') && !(a.innerText || '').includes('完成')
    );
    return hasEvalLinks || !!document.querySelector('tbody tr a');
  }

  // 版本号比较（用于范围匹配）
  function compareVersion(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;
      if (num1 !== num2) return num1 - num2;
    }
    return 0;
  }

  function isInRange(questionNum, start, end) {
    return compareVersion(questionNum, start) >= 0 && compareVersion(questionNum, end) <= 0;
  }

  // 获取指定题目的选项索引
  function getOptionIndex(questionNum) {
    // 1. 优先检查精确配置
    if (CONFIG.questionConfig.specific[questionNum] !== undefined) {
      return CONFIG.questionConfig.specific[questionNum];
    }

    // 2. 检查范围配置
    for (const range of CONFIG.questionConfig.ranges) {
      if (isInRange(questionNum, range.start, range.end)) {
        return range.optionIndex;
      }
    }

    // 3. 返回默认值
    return CONFIG.questionConfig.defaultOptionIndex;
  }

  function fillQuestions() {
    const boxes = document.querySelectorAll('.qBox.objective, .question-item, [class*="question"]');
    let filledCount = 0;
    const stats = {}; // 统计各选项使用次数

    boxes.forEach(box => {
      const indexEl = box.querySelector('.indexno, .question-index, [class*="index"]');
      let questionNum = indexEl?.innerText?.trim() || '';

      const radios = [...box.querySelectorAll('input[type="radio"]')];
      if (!radios.length) return;

      const alreadyChecked = radios.some(r => r.checked);
      if (alreadyChecked) return;

      const targetIndex = getOptionIndex(questionNum);
      const safeIndex = Math.min(targetIndex, radios.length - 1);

      radios[safeIndex].checked = true;
      trigger(radios[safeIndex]);
      filledCount++;

      stats[`选项${safeIndex + 1}`] = (stats[`选项${safeIndex + 1}`] || 0) + 1;
    });

    if (filledCount > 0) {
      const statsStr = Object.entries(stats).map(([k, v]) => `${k}:${v}`).join(', ');
      log(`已填写 ${filledCount} 道单选题 (${statsStr})`);
    }
    return filledCount;
  }

  function fillTextareas() {
    const textareas = document.querySelectorAll('textarea');
    let filledCount = 0;

    textareas.forEach(ta => {
      if (ta.disabled || ta.readOnly) return;
      if (ta.value && ta.value.trim() !== '') return;

      ta.value = CONFIG.textareaValue;
      trigger(ta);
      filledCount++;
    });

    if (filledCount > 0) log(`已填写 ${filledCount} 个文本框`);
    return filledCount;
  }

  function fillOnly() {
    fillQuestions();
    fillTextareas();
    log('仅填写完成，未提交');
  }

  function findSubmitButton() {
    let btn = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], a')]
      .find(el => {
        const text = (el.innerText || el.value || '').trim();
        return text === '提交' || text === '提交评教' || text.includes('提交');
      });

    if (!btn) {
      btn = document.querySelector('.btn-submit, .submit-btn, button[class*="submit"], input[class*="submit"]');
    }

    return btn;
  }

  async function submitOnly() {
    await sleep(300);

    const btn = findSubmitButton();

    if (!btn) {
      log('❌ 未找到提交按钮', true);
      return false;
    }

    if (btn.disabled) {
      log('❌ 提交按钮已禁用', true);
      return false;
    }

    log('找到提交按钮，准备提交');
    btn.click();

    const form = btn.closest('form');
    if (form) {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }

    log('✓ 已提交');
    return true;
  }

  async function fillAndSubmit() {
    updateUIStatus('✍️ 填写中...');
    fillQuestions();
    fillTextareas();
    updateUIStatus('📤 提交中...');
    await sleep(500);
    const result = await submitOnly();
    if (result) {
      updateUIStatus('✅ 已提交');
    } else {
      updateUIStatus('❌ 提交失败');
    }
  }

  function scanTasks() {
    const tasks = [];

    const rows = document.querySelectorAll('tbody tr, .list-table tr, [class*="table"] tr');
    rows.forEach(row => {
      const text = row.innerText || '';
      if (text.includes('评教完成') || text.includes('已完成')) return;

      const links = [...row.querySelectorAll('a')].filter(a => {
        const linkText = (a.innerText || '').trim();
        return (linkText.includes('评教') || linkText.includes('评价')) &&
               !linkText.includes('完成') &&
               a.href && a.href.includes('eams');
      });

      links.forEach(link => {
        const teacherMatch = text.match(/([\u4e00-\u9fa5]{2,4})(?:教授|老师|教师)/);
        const teacher = teacherMatch ? teacherMatch[1] : link.innerText.replace(/[（(]进行评教[）)]/g, '').trim();

        tasks.push({
          teacher: teacher,
          href: link.href
        });
      });
    });

    if (tasks.length === 0) {
      const evalLinks = [...document.querySelectorAll('a')].filter(a => {
        const text = (a.innerText || '').trim();
        return (text === '评教' || text === '进行评教') && a.href;
      });
      evalLinks.forEach(link => {
        tasks.push({
          teacher: '未知教师',
          href: link.href
        });
      });
    }

    log(`扫描到 ${tasks.length} 个待评教任务`);
    return tasks;
  }

  function saveState(state) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...state,
        timestamp: Date.now()
      }));
    } catch (e) {}
  }

  function loadState() {
    try {
      const data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
      if (data.timestamp && Date.now() - data.timestamp > 3600000) {
        return {};
      }
      return data;
    } catch {
      return {};
    }
  }

  function clearState() {
    sessionStorage.removeItem(STORAGE_KEY);
    isRunning = false;
    log('已停止批量模式');
  }

  // 一键完成：自动遍历所有待评教教师，填写并提交
  async function startBatch() {
    if (isRunning) {
      log('批量模式已在运行中');
      return;
    }

    const tasks = scanTasks();
    if (tasks.length === 0) {
      log('没有找到待评教任务', true);
      return;
    }

    isRunning = true;
    saveState({ running: true, currentIndex: 0, tasks });

    updateUIStatus('🚀 批量运行中');
    updateUIProgress(0, tasks.length);
    updateUICurrent(tasks[0].teacher);

    log(`开始批量评教，共 ${tasks.length} 个任务`);
    location.href = tasks[0].href;
  }

  async function continueBatch() {
    if (!isRunning) {
      const state = loadState();
      if (!state.running) return;
      isRunning = true;
    }

    const state = loadState();
    if (!state.running || !state.tasks) {
      isRunning = false;
      return;
    }

    const { tasks, currentIndex = 0 } = state;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= tasks.length) {
      clearState();
      updateUIStatus('✅ 全部完成');
      updateUIProgress(tasks.length, tasks.length);
      log(`🎉 评教完成！共完成 ${tasks.length} 个任务`);
      return;
    }

    const nextTask = tasks[nextIndex];
    updateUIProgress(nextIndex, tasks.length);
    updateUICurrent(nextTask.teacher);
    updateUIStatus('🔗 跳转中');

    saveState({ ...state, currentIndex: nextIndex });

    await sleep(500);
    location.href = nextTask.href;
  }

  // 评教详情页处理：始终填写并提交（批量模式专用）
  async function handleDetailPageForBatch() {
    updateUIStatus('✍️ 填写中...');
    await sleep(CONFIG.delay);
    fillQuestions();
    fillTextareas();
    updateUIStatus('📤 提交中...');
    await sleep(500);
    await submitOnly();
    updateUIStatus('✅ 已提交');
  }

  async function handleListPage() {
    const state = loadState();
    if (state.running) {
      await continueBatch();
    } else {
      updateUIStatus('⚡ 就绪');
    }
  }

  function updateUIStatus(text) {
    const el = document.querySelector('#cuit-status');
    if (el) el.textContent = text;
  }

  function updateUIProgress(current, total) {
    const el = document.querySelector('#cuit-progress');
    if (el) el.textContent = `${current}/${total}`;
  }

  function updateUICurrent(text) {
    const el = document.querySelector('#cuit-current');
    if (el) el.textContent = text.length > 20 ? text.slice(0, 18) + '...' : text;
  }

  // 加载用户配置
  function loadUserConfig() {
    try {
      const saved = localStorage.getItem('cuit_eval_config_v2');
      if (saved) {
        const userConfig = JSON.parse(saved);
        Object.assign(CONFIG, userConfig);
      }
    } catch (e) {}
  }

  // 保存用户配置
  function saveUserConfig() {
    // 解析范围配置
    const rangesText = document.getElementById('cfg-ranges')?.value || '';
    const ranges = [];
    rangesText.split('\n').forEach(line => {
      line = line.trim();
      if (!line) return;
      // 格式: 1.1-1.11:0 或 1.1-1.11 0
      const match = line.match(/([\d.]+)\s*[-~]\s*([\d.]+)\s*[:：]?\s*(\d+)/);
      if (match) {
        ranges.push({
          start: match[1],
          end: match[2],
          optionIndex: parseInt(match[3])
        });
      }
    });

    // 解析精确配置
    const specificText = document.getElementById('cfg-specific')?.value || '';
    const specific = {};
    specificText.split('\n').forEach(line => {
      line = line.trim();
      if (!line) return;
      // 格式: 1.5:1 或 1.5 1
      const match = line.match(/([\d.]+)\s*[:：]?\s*(\d+)/);
      if (match) {
        specific[match[1]] = parseInt(match[2]);
      }
    });

    const newConfig = {
      textareaValue: document.getElementById('cfg-textarea')?.value || CONFIG.textareaValue,
      delay: parseInt(document.getElementById('cfg-delay')?.value || CONFIG.delay),
      questionConfig: {
        ranges: ranges.length ? ranges : CONFIG.questionConfig.ranges,
        specific: specific,
        defaultOptionIndex: parseInt(document.getElementById('cfg-default')?.value || CONFIG.questionConfig.defaultOptionIndex)
      }
    };

    Object.assign(CONFIG, newConfig);
    localStorage.setItem('cuit_eval_config_v2', JSON.stringify(newConfig));
    log('配置已保存');
  }

  // 生成配置示例文本
  function getRangesExample() {
    return CONFIG.questionConfig.ranges.map(r => `${r.start}-${r.end}:${r.optionIndex}`).join('\n');
  }

  function getSpecificExample() {
    const specific = CONFIG.questionConfig.specific;
    if (Object.keys(specific).length === 0) {
      return '# 示例: 1.5:1';
    }
    return Object.entries(specific).map(([k, v]) => `${k}:${v}`).join('\n');
  }

  function addPanel() {
    if (document.querySelector('#cuit-eval-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'cuit-eval-panel';
    panel.innerHTML = `
      <div class="cuit-header">
        <span class="cuit-title">📝 CUIT 评教助手</span>
        <button class="cuit-minimize" id="cuit-minimize">−</button>
      </div>

      <div class="cuit-body">
        <div class="cuit-info">
          <div>状态：<span id="cuit-status">⚡ 就绪</span></div>
          <div>进度：<span id="cuit-progress">-/-</span></div>
          <div>当前：<span id="cuit-current">-</span></div>
        </div>

        <div class="cuit-buttons">
          <button id="cuit-fill-btn" class="cuit-btn primary">✨ 仅填写</button>
          <button id="cuit-submit-btn" class="cuit-btn success">🚀 填写并提交</button>
        </div>

        <div class="cuit-buttons">
          <button id="cuit-batch-btn" class="cuit-btn batch">📚 一键完成</button>
          <button id="cuit-stop-btn" class="cuit-btn danger">⛔ 停止</button>
        </div>

        <details class="cuit-details">
          <summary>⚙️ 题目选项配置</summary>
          <div class="cuit-config">
            <label>📊 范围配置 (每行: 起始-结束:选项):</label>
            <textarea id="cfg-ranges" rows="3" placeholder="1.1-1.11:0&#10;1.12-1.14:2&#10;2.1-2.10:0"></textarea>

            <label>🎯 精确配置 (每行: 题号:选项，优先级更高):</label>
            <textarea id="cfg-specific" rows="2" placeholder="1.5:1&#10;2.3:2"></textarea>

            <label>🔢 默认选项 (题号未匹配时使用):</label>
            <input type="number" id="cfg-default" min="0" value="${CONFIG.questionConfig.defaultOptionIndex}">

            <label>📝 文本框内容:</label>
            <input type="text" id="cfg-textarea" value="${CONFIG.textareaValue}">

            <label>⏱️ 延迟(ms):</label>
            <input type="number" id="cfg-delay" min="200" max="3000" value="${CONFIG.delay}">

            <button id="cfg-save" class="cuit-btn small">💾 保存配置</button>
          </div>
        </details>

        <div class="cuit-log">⚡ <span id="cuit-log-content">就绪</span></div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #cuit-eval-panel {
        position: fixed;
        right: 20px;
        bottom: 20px;
        width: 320px;
        z-index: 2147483647;
        background: rgba(30, 30, 40, 0.95);
        backdrop-filter: blur(12px);
        border-radius: 16px;
        border: 1px solid rgba(71, 118, 230, 0.4);
        box-shadow: 0 10px 35px rgba(0, 0, 0, 0.3);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        color: #e0e0e0;
      }
      .cuit-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        background: linear-gradient(135deg, #2f6fed, #7b61ff);
        border-radius: 16px 16px 0 0;
        cursor: move;
      }
      .cuit-title {
        font-weight: 700;
        font-size: 14px;
        color: white;
      }
      .cuit-minimize {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }
      .cuit-body {
        padding: 12px;
      }
      .cuit-info {
        background: rgba(255,255,255,0.08);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        margin-bottom: 10px;
      }
      .cuit-info span {
        color: #7b61ff;
        font-weight: 600;
      }
      .cuit-buttons {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
      }
      .cuit-btn {
        flex: 1;
        padding: 8px 0;
        border: none;
        border-radius: 10px;
        font-weight: 600;
        cursor: pointer;
        transition: 0.2s;
        font-size: 12px;
      }
      .cuit-btn.primary {
        background: linear-gradient(135deg, #2f6fed, #4c8dff);
        color: white;
      }
      .cuit-btn.success {
        background: linear-gradient(135deg, #10b981, #34d399);
        color: white;
      }
      .cuit-btn.batch {
        background: #3b82f6;
        color: white;
      }
      .cuit-btn.danger {
        background: #ef4444;
        color: white;
      }
      .cuit-btn.small {
        flex: none;
        padding: 5px 12px;
        background: #3b82f6;
        color: white;
        margin-top: 8px;
      }
      .cuit-btn:hover {
        transform: translateY(-1px);
        filter: brightness(1.05);
      }
      .cuit-details {
        margin: 10px 0 8px;
      }
      .cuit-details summary {
        cursor: pointer;
        color: #9ca3af;
        font-size: 11px;
        user-select: none;
      }
      .cuit-config {
        margin-top: 8px;
        padding: 8px;
        background: rgba(255,255,255,0.05);
        border-radius: 8px;
        font-size: 11px;
      }
      .cuit-config label {
        display: block;
        margin: 8px 0 4px;
        color: #9ca3af;
      }
      .cuit-config textarea {
        width: 100%;
        padding: 6px;
        border-radius: 6px;
        border: 1px solid #4b5563;
        background: #1f2937;
        color: white;
        font-size: 11px;
        font-family: monospace;
        resize: vertical;
        box-sizing: border-box;
      }
      .cuit-config input[type="number"],
      .cuit-config input[type="text"] {
        width: 100%;
        padding: 6px;
        border-radius: 6px;
        border: 1px solid #4b5563;
        background: #1f2937;
        color: white;
        box-sizing: border-box;
      }
      .cuit-log {
        font-size: 11px;
        color: #9ca3af;
        padding: 6px 0 0;
        border-top: 1px solid rgba(255,255,255,0.1);
        margin-top: 6px;
      }
      .cuit-minimized .cuit-body {
        display: none;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(panel);

    // 填充当前配置到文本框
    const rangesTextarea = document.getElementById('cfg-ranges');
    if (rangesTextarea) {
      rangesTextarea.value = getRangesExample();
    }
    const specificTextarea = document.getElementById('cfg-specific');
    if (specificTextarea) {
      specificTextarea.value = getSpecificExample();
    }

    // 仅填写按钮
    document.getElementById('cuit-fill-btn').onclick = () => {
      fillOnly();
    };

    // 填写并提交按钮
    document.getElementById('cuit-submit-btn').onclick = async () => {
      await fillAndSubmit();
    };

    // 一键完成按钮（自动遍历+提交）
    document.getElementById('cuit-batch-btn').onclick = startBatch;

    // 停止按钮
    document.getElementById('cuit-stop-btn').onclick = clearState;

    // 保存配置
    document.getElementById('cfg-save').onclick = saveUserConfig;

    // 最小化
    let minimized = false;
    document.getElementById('cuit-minimize').onclick = () => {
      minimized = !minimized;
      panel.classList.toggle('cuit-minimized', minimized);
    };

    // 拖拽
    let isDragging = false;
    let offsetX, offsetY;
    const header = panel.querySelector('.cuit-header');
    header.onmousedown = (e) => {
      if (e.target === header || header.contains(e.target)) {
        isDragging = true;
        offsetX = e.clientX - panel.offsetLeft;
        offsetY = e.clientY - panel.offsetTop;
        panel.style.position = 'fixed';
        panel.style.right = 'auto';
        panel.style.left = panel.offsetLeft + 'px';
        panel.style.bottom = 'auto';
        panel.style.top = panel.offsetTop + 'px';
      }
    };
    window.onmousemove = (e) => {
      if (isDragging) {
        panel.style.left = (e.clientX - offsetX) + 'px';
        panel.style.top = (e.clientY - offsetY) + 'px';
      }
    };
    window.onmouseup = () => { isDragging = false; };
  }

  async function init() {
    loadUserConfig();
    addPanel();
    await sleep(500);

    if (isDetailPage()) {
      // 检查是否在批量模式中
      const state = loadState();
      if (state.running) {
        await handleDetailPageForBatch();
      }
      // 不在批量模式时，静默等待用户操作
    } else if (isListPage()) {
      await handleListPage();
    }

    log('就绪');
  }

  init();
})();
