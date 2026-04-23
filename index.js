const CODE_DATA = {
  "HikariDataSource.java": {
    id: "hds",
    description: "HikariCP의 진입점 역할을 하는 DataSource 구현체입니다.",
    code: `public class HikariDataSource extends HikariConfig implements DataSource, Closeable {
    
   private final AtomicBoolean isShutdown = new AtomicBoolean();
   private final HikariPool fastPathPool;
   private volatile HikariPool pool;

   /**
    * ✅ Connection 요청 시 첫 번째 단계
    */
   @Override
   public Connection getConnection() throws SQLException {
      if (isClosed()) {
         throw new SQLException("HikariDataSource " + this + " has been closed.");
      }

      // Spring Boot 사용 시 보통 fastPathPool에서 커넥션을 가져옵니다.
      if (fastPathPool != null) {
         return fastPathPool.getConnection();
      }

      // See http://en.wikipedia.org/wiki/Double-checked_locking#Usage_in_Java
      HikariPool result = pool;
      if (result == null) {
         synchronized (this) {
            result = pool;
            if (result == null) {
               validate();
               LOGGER.info("{} - Starting...", getPoolName());
               try {
                  pool = result = new HikariPool(this);
                  this.seal();
               }
               catch (PoolInitializationException pie) {
                  if (pie.getCause() instanceof SQLException) {
                     throw (SQLException) pie.getCause();
                  }
                  else {
                     throw pie;
                  }
               }
               LOGGER.info("{} - Start completed.", getPoolName());
            }
         }
      }

      return result.getConnection();
   }
}`,
    methods: [{ name: "getConnection", id: "hds-getconn" }]
  },
  "HikariPool.java": {
    id: "hp",
    description: "실제 커넥션 풀을 관리하며 대기 및 시간 초과 로직을 처리합니다.",
    code: `public final class HikariPool extends PoolBase implements HikariPoolMXBean, IBagStateListener {

   private final PoolEntryCreator poolEntryCreator = new PoolEntryCreator();
   private final PoolEntryCreator postFillPoolEntryCreator = new PoolEntryCreator("After adding ");
   private final ThreadPoolExecutor addConnectionExecutor;
   private final ThreadPoolExecutor closeConnectionExecutor;
   
   private final ConcurrentBag<PoolEntry> connectionBag; // ✅ 커넥션이 담겨 있는 실제 보관함
   
   private final ScheduledExecutorService houseKeepingExecutorService;

   public Connection getConnection() throws SQLException {
      return getConnection(connectionTimeout);
   }

   public Connection getConnection(final long hardTimeout) throws SQLException {
      suspendResumeLock.acquire();
      final var startTime = currentTime();

      try {
         var timeout = hardTimeout;
         do {
            // ✅ ConcurrentBag에서 커넥션을 빌려옵니다.
            var poolEntry = connectionBag.borrow(timeout, MILLISECONDS);

            if (poolEntry == null) {
               break; // We timed out... break and throw exception
            }

            final var now = currentTime();
            if (poolEntry.isMarkedEvicted() || (elapsedMillis(poolEntry.lastAccessed, now) > aliveBypassWindowMs && isConnectionDead(poolEntry.connection))) {
               closeConnection(poolEntry, poolEntry.isMarkedEvicted() ? EVICTED_CONNECTION_MESSAGE : DEAD_CONNECTION_MESSAGE);
               timeout = hardTimeout - elapsedMillis(startTime);
            } else {
               metricsTracker.recordBorrowStats(poolEntry, startTime);
               if (isRequestBoundariesEnabled) {
                  try {
                     poolEntry.connection.beginRequest();
                  } catch (SQLException e) {
                     logger.warn("beginRequest Failed for: {}, ({})", poolEntry.connection, e.getMessage());
                  }
               }
               // ✅ 최종적으로 HikariProxyConnection으로 감싸서 반환합니다.
               return poolEntry.createProxyConnection(leakTaskFactory.schedule(poolEntry));
            }
         } while (timeout > 0L);

         metricsTracker.recordBorrowTimeoutStats(startTime);
         throw new SQLException("Timeout");
      } 
      catch (InterruptedException e) {
         Thread.currentThread().interrupt();
         throw new SQLException(poolName + " - Interrupted during connection acquisition", e);
      }
      finally {
         suspendResumeLock.release();
      }
   }

   /**
    * ✅ Connection 반납 시 호출되는 메서드
    */
   void recycle(final PoolEntry poolEntry) {
      metricsTracker.recordConnectionUsage(poolEntry);
      if (poolEntry.isMarkedEvicted()) {
         closeConnection(poolEntry, EVICTED_CONNECTION_MESSAGE);
      } else {
         if (isRequestBoundariesEnabled) {
            try {
               poolEntry.connection.endRequest();
            } catch (SQLException e) {
               logger.warn("endRequest Failed for: {},({})", poolEntry.connection, e.getMessage());
            }
         }
         connectionBag.requite(poolEntry); // ✅ 다시 ConcurrentBag으로 반납
      }
   }
   
   @Override
   public void addBagItem(final int waiting)
   {
      if (waiting > addConnectionExecutor.getQueue().size())
         addConnectionExecutor.submit(poolEntryCreator);
   }

   private void checkFailFast()
   {
      final var initializationFailTimeout = config.getInitializationFailTimeout();
      if (initializationFailTimeout < 0) {
         return;
      }

      final var startTime = currentTime();
      do {
         final var poolEntry = createPoolEntry();
         if (poolEntry != null) {
            if (config.getMinimumIdle() > 0) {
               connectionBag.add(poolEntry);
               logger.info("{} - Added connection {}", poolName, poolEntry.connection);
            }
            else {
               quietlyCloseConnection(poolEntry.close(), "(initialization check complete and minimumIdle is zero)");
            }

            return;
         }

         if (getLastConnectionFailure() instanceof ConnectionSetupException) {
            throwPoolInitializationException(getLastConnectionFailure().getCause());
         }

         quietlySleep(SECONDS.toMillis(1));
      } while (elapsedMillis(startTime) < initializationFailTimeout);

      if (initializationFailTimeout > 0) {
         throwPoolInitializationException(getLastConnectionFailure());
      }
   }

   private synchronized void fillPool(final boolean isAfterAdd)
   {
      final var idle = getIdleConnections();
      final var shouldAdd = getTotalConnections() < config.getMaximumPoolSize() && idle < config.getMinimumIdle();

      if (shouldAdd) {
         final var countToAdd = config.getMinimumIdle() - idle;
         for (int i = 0; i < countToAdd; i++)
            addConnectionExecutor.submit(isAfterAdd ? postFillPoolEntryCreator : poolEntryCreator);
      }
      else if (isAfterAdd) {
         logger.debug("{} - Fill pool skipped, pool has sufficient level or currently being filled.", poolName);
      }
   }
}`,
    methods: [
      { name: "getConnection", id: "hp-getconn" },
      { name: "recycle", id: "hp-recycle" },
      { name: "addBagItem", id: "hp-addbagitem" },
      { name: "checkFailFast", id: "hp-checkfailfast" },
      { name: "fillPool", id: "hp-fillpool" }
    ]
  },
  "ConcurrentBag.java": {
    id: "cb",
    description: "HikariCP 성능의 핵심으로, Lock-free 지향적인 커넥션 보관 구조입니다.",
    code: `public class ConcurrentBag<T extends IConcurrentBagEntry> implements AutoCloseable {

   public interface IConcurrentBagEntry
   {
      int STATE_NOT_IN_USE = 0;
      int STATE_IN_USE = 1;
      int STATE_REMOVED = -1;
      int STATE_RESERVED = -2;

      boolean compareAndSet(int expectState, int newState);
      void setState(int newState);
      int getState();
   }

   private final CopyOnWriteArrayList<T> sharedList;
   private final ThreadLocal<List<Object>> threadLocalList; // ✅ 스레드별 커넥션 캐시
   private final SynchronousQueue<T> handoffQueue;

   /**
    * ✅ 커넥션 획득 로직 (borrow)
    */
   public T borrow(long timeout, final TimeUnit timeUnit) throws InterruptedException {
      // 1️⃣ ThreadLocal 캐시에서 먼저 찾기
      // Try the thread-local list first
      final var list = threadLocalList.get();
      for (var i = list.size() - 1; i >= 0; i--) {
         final var entry = list.remove(i);
         @SuppressWarnings("unchecked")
         final T bagEntry = useWeakThreadLocals ? ((WeakReference<T>) entry).get() : (T) entry;
         if (bagEntry != null && bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
            return bagEntry;
         }
      }

      // Otherwise, scan the shared list ... then poll the handoff queue
      const waiting = waiters.incrementAndGet();
      try {
         // 2️⃣ sharedList (전체 목록) 스캔 및 CAS 시도
         for (T bagEntry : sharedList) {
            if (bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
               // If we may have stolen another waiter's connection, request another bag add.
               if (waiting > 1) {
                  listener.addBagItem(waiting - 1);
               }
               return bagEntry;
            }
         }

         // 3️⃣ handoffQueue에서 대기
         listener.addBagItem(waiting);
         
         timeout = timeUnit.toNanos(timeout);
         do {
            final var start = currentTime();
            final T bagEntry = handoffQueue.poll(timeout, NANOSECONDS);
            if (bagEntry == null || bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
               return bagEntry;
            }
            
            timeout -= elapsedNanos(start);
         } while (timeout > 10_000);

         return null;
      } 
      finally {
         waiters.decrementAndGet();
      }
   }

   /**
    * ✅ 커넥션 반납 로직 (requite)
    */
   public void requite(final T bagEntry) {
      bagEntry.setState(STATE_NOT_IN_USE);

      for (int i = 1, waiting = waiters.get(); waiting > 0; i++, waiting = waiters.get()) {
         if (bagEntry.getState() != STATE_NOT_IN_USE || handoffQueue.offer(bagEntry)) {
            return;
         }
         else if ((i & 0xff) == 0xff || (waiting > 1 && i % waiting == 0)) {
            parkNanos(MICROSECONDS.toNanos(10));
         }
         else {
            Thread.yield();
         }
      }

      final var threadLocalEntries = this.threadLocalList.get();
      if (threadLocalEntries.size() < 16) {
         threadLocalEntries.add(useWeakThreadLocals ? new WeakReference<>(bagEntry) : bagEntry);
      }
   }
}`,
    anchors: [
      { match: "public interface IConcurrentBagEntry", id: "cb-iconcurrentbagentry" },
      { match: "boolean compareAndSet(int expectState, int newState);", id: "cb-entry-compareandset" },
      { match: "void setState(int newState);", id: "cb-entry-setstate" },
      { match: "int getState();", id: "cb-entry-getstate" }
    ],
    methods: [
      { name: "borrow", id: "cb-borrow" },
      { name: "requite", id: "cb-requite" }
    ]
  },
  "PoolEntry.java": {
    id: "pe",
    description: "커넥션 객체와 그 상태를 관리하는 핵심 래퍼 클래스입니다.",
    code: `final class PoolEntry implements IConcurrentBagEntry {
    
   private static final AtomicIntegerFieldUpdater<PoolEntry> stateUpdater;
    
   Connection connection;
   long lastAccessed;
   private volatile int state = 0;
   private final HikariPool hikariPool;

   /**
    * ✅ 자신을 관리하는 HikariPool에 반납 요청
    */
   void recycle() {
      if (connection != null) {
         this.lastAccessed = currentTime();
         hikariPool.recycle(this);
      }
   }
   
   /**
    * ✅ 상태를 변경하는 원자적인 CAS 메서드
    */ 
   @Override
   public boolean compareAndSet(int expect, int update)
   {
      return stateUpdater.compareAndSet(this, expect, update);
   }

   @Override
   public int getState()
   {
      return stateUpdater.get(this);
   }

   @Override
   public void setState(int update)
   {
      stateUpdater.set(this, update);
   }
}`,
    methods: [
      { name: "recycle", id: "pe-recycle" },
      { name: "compareAndSet", id: "pe-compareandset" },
      { name: "getState", id: "pe-getstate" },
      { name: "setState", id: "pe-setstate" }
    ]
  }
};

const KEYWORDS = new Set([
  "public", "private", "protected", "final", "volatile", "class", "extends",
  "implements", "interface", "new", "return", "if", "else", "do", "while",
  "for", "try", "catch", "finally", "throw", "throws", "var", "int", "long",
  "boolean", "void", "static", "const"
]);
const CLASS_ICON_PATH = "./image/class_icon.png";
const SYMBOL_LINKS = {
  IConcurrentBagEntry: {
    file: "ConcurrentBag.java",
    anchor: "cb-iconcurrentbagentry"
  }
};
const FILE_PRIMARY_TYPES = {
  "HikariDataSource.java": "HikariDataSource",
  "HikariPool.java": "HikariPool",
  "ConcurrentBag.java": "ConcurrentBag",
  "PoolEntry.java": "PoolEntry"
};
const TYPE_METHOD_LINKS = {
  HikariDataSource: {
    getConnection: { file: "HikariDataSource.java", anchor: "hds-getconn" }
  },
  HikariPool: {
    getConnection: { file: "HikariPool.java", anchor: "hp-getconn" },
    recycle: { file: "HikariPool.java", anchor: "hp-recycle" },
    addBagItem: { file: "HikariPool.java", anchor: "hp-addbagitem" },
    checkFailFast: { file: "HikariPool.java", anchor: "hp-checkfailfast" },
    fillPool: { file: "HikariPool.java", anchor: "hp-fillpool" }
  },
  ConcurrentBag: {
    borrow: { file: "ConcurrentBag.java", anchor: "cb-borrow" },
    requite: { file: "ConcurrentBag.java", anchor: "cb-requite" }
  },
  PoolEntry: {
    recycle: { file: "PoolEntry.java", anchor: "pe-recycle" },
    compareAndSet: { file: "PoolEntry.java", anchor: "pe-compareandset" },
    getState: { file: "PoolEntry.java", anchor: "pe-getstate" },
    setState: { file: "PoolEntry.java", anchor: "pe-setstate" }
  },
  IConcurrentBagEntry: {
    compareAndSet: { file: "ConcurrentBag.java", anchor: "cb-entry-compareandset" },
    getState: { file: "ConcurrentBag.java", anchor: "cb-entry-getstate" },
    setState: { file: "ConcurrentBag.java", anchor: "cb-entry-setstate" }
  }
};
const TYPE_MEMBER_TYPES = {
  HikariDataSource: {
    fastPathPool: "HikariPool",
    pool: "HikariPool"
  },
  HikariPool: {
    connectionBag: "ConcurrentBag"
  },
  PoolEntry: {
    hikariPool: "HikariPool"
  }
};
const MANUAL_TYPE_CONTEXTS = {
  "ConcurrentBag.java": {
    bagEntry: "PoolEntry",
    listener: "HikariPool"
  }
};
const KNOWN_TYPES = [...Object.values(FILE_PRIMARY_TYPES), "IConcurrentBagEntry"];
const TYPE_CONTEXTS = Object.fromEntries(
  Object.entries(CODE_DATA).map(([fileName, file]) => {
    const context = {
      this: FILE_PRIMARY_TYPES[fileName],
      ...(MANUAL_TYPE_CONTEXTS[fileName] || {})
    };
    const declarationRegex = new RegExp(
      `\\b(${KNOWN_TYPES.join("|")})(?:<[^>]+>)?\\s+(\\w+)\\b`,
      "g"
    );

    for (const match of file.code.matchAll(declarationRegex)) {
      const [, typeName, variableName] = match;
      context[variableName] = typeName;
    }

    return [fileName, context];
  })
);

const state = {
  activeFile: "HikariDataSource.java",
  searchTerm: ""
};

const fileListEl = document.getElementById("file-list");
const tabsEl = document.getElementById("tabs");
const summaryEl = document.getElementById("summary");
const codeEl = document.getElementById("code");
const footerPathEl = document.getElementById("footer-path");
const searchEl = document.getElementById("search");
const viewerEl = document.getElementById("viewer");
const historyBackEl = document.getElementById("history-back");
const historyForwardEl = document.getElementById("history-forward");

const navigationHistory = {
  backStack: [],
  forwardStack: []
};

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderLink(className, label, fileName, anchor) {
  const anchorAttr = anchor ? ` data-anchor="${anchor}"` : "";
  return `<span class="${className}" data-file="${fileName}"${anchorAttr}>${label}</span>`;
}

function isMethodDeclaration(line, methodName) {
  const declarationPattern = new RegExp(
    `^\\s*(?:@\\w+\\s+)?(?:public|private|protected)?(?:\\s+(?:static|final|synchronized|abstract|default|native|strictfp))*\\s*(?:<[\\w\\s,?]+>\\s+)?(?:[\\w.<>\\[\\],?]+\\s+)+${methodName}\\s*\\(`
  );
  return declarationPattern.test(line);
}

function findReceiverExpression(prefix) {
  const match = prefix.match(/([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\.\s*$/);
  return match?.[1] || null;
}

function resolveExpressionType(fileName, expression) {
  const parts = expression.split(".");
  let currentType = TYPE_CONTEXTS[fileName]?.[parts[0]];

  if (!currentType) {
    return null;
  }

  for (let index = 1; index < parts.length; index += 1) {
    currentType = TYPE_MEMBER_TYPES[currentType]?.[parts[index]];
    if (!currentType) {
      return null;
    }
  }

  return currentType;
}

function resolveMethodTarget(fileName, line, methodName, offset) {
  const receiverExpression = findReceiverExpression(line.slice(0, offset));
  if (receiverExpression) {
    const receiverType = resolveExpressionType(fileName, receiverExpression);
    return receiverType ? TYPE_METHOD_LINKS[receiverType]?.[methodName] || null : null;
  }

  if (isMethodDeclaration(line, methodName)) {
    return null;
  }

  const currentType = FILE_PRIMARY_TYPES[fileName];
  return TYPE_METHOD_LINKS[currentType]?.[methodName] || null;
}

function getCurrentLocation() {
  return {
    file: state.activeFile,
    scrollTop: viewerEl.scrollTop
  };
}

function isSameLocation(left, right) {
  return left?.file === right?.file && left?.scrollTop === right?.scrollTop;
}

function updateHistoryButtons() {
  historyBackEl.disabled = navigationHistory.backStack.length === 0;
  historyForwardEl.disabled = navigationHistory.forwardStack.length === 0;
}

function restoreLocation(location) {
  if (!location || !CODE_DATA[location.file]) {
    return;
  }

  setActiveFile(location.file);
  requestAnimationFrame(() => {
    viewerEl.scrollTop = location.scrollTop ?? 0;
  });
}

function pushHistoryEntry(entry) {
  const lastEntry = navigationHistory.backStack[navigationHistory.backStack.length - 1];
  if (!isSameLocation(lastEntry, entry)) {
    navigationHistory.backStack.push(entry);
  }
  navigationHistory.forwardStack = [];
  updateHistoryButtons();
}

function navigateToFile(fileName, options = {}) {
  if (!CODE_DATA[fileName]) {
    return;
  }

  const {
    anchor,
    preserveScroll = false,
    pushHistory = false
  } = options;

  if (pushHistory) {
    pushHistoryEntry(getCurrentLocation());
  }

  setActiveFile(fileName);
  requestAnimationFrame(() => {
    if (!preserveScroll) {
      viewerEl.scrollTop = 0;
    }

    if (anchor) {
      const target = document.getElementById(anchor);
      if (!target) {
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("highlight");
      window.setTimeout(() => target.classList.remove("highlight"), 1500);
    }
  });
}

function highlightLine(line, fileName) {
  let codePart = line;
  let commentPart = "";
  const commentIdx = line.indexOf("//");
  const blockCommentIdx = line.indexOf("/*");
  const finalCommentIdx = commentIdx !== -1 ? commentIdx : blockCommentIdx;

  if (finalCommentIdx !== -1) {
    codePart = line.slice(0, finalCommentIdx);
    commentPart = `<span class="comment">${escapeHtml(line.slice(finalCommentIdx))}</span>`;
  }

  const classNames = Object.keys(CODE_DATA).map((name) => name.replace(".java", ""));
  const masterRegex = /("(?:\\.|[^\\"])*")|(@\w+)|(\b\w+\b)(?=\s*\()|(\b\w+\b)|([^\w\s]+)|(\s+)/g;

  const formattedCode = codePart.replace(
    masterRegex,
    (match, string, annotation, methodWord, word, operator, space, offset) => {
      if (string) return `<span class="string">${escapeHtml(string)}</span>`;
      if (annotation) return `<span class="anno">${escapeHtml(annotation)}</span>`;
      if (methodWord) {
        if (SYMBOL_LINKS[methodWord]) {
          const { file, anchor } = SYMBOL_LINKS[methodWord];
          return renderLink("class-link", methodWord, file, anchor);
        }
        if (classNames.includes(methodWord)) {
          return renderLink("class-link", methodWord, `${methodWord}.java`);
        }

        const methodTarget = resolveMethodTarget(fileName, codePart, methodWord, offset);
        if (methodTarget) {
          return renderLink("method-link", methodWord, methodTarget.file, methodTarget.anchor);
        }

        if (/^[A-Z]/.test(methodWord)) return `<span class="type">${methodWord}</span>`;
        return methodWord;
      }
      if (word) {
        if (KEYWORDS.has(word)) return `<span class="kw">${word}</span>`;
        if (SYMBOL_LINKS[word]) {
          const { file, anchor } = SYMBOL_LINKS[word];
          return renderLink("class-link", word, file, anchor);
        }
        if (classNames.includes(word)) {
          return renderLink("class-link", word, `${word}.java`);
        }
        if (/^[A-Z]/.test(word)) return `<span class="type">${word}</span>`;
        return word;
      }
      if (operator) return `<span class="op">${escapeHtml(operator)}</span>`;
      return space || match;
    }
  );

  return formattedCode + commentPart;
}

function setActiveFile(fileName) {
  if (!CODE_DATA[fileName]) {
    return;
  }

  state.activeFile = fileName;
  render();
}

function jumpToAnchor(fileName, targetId) {
  navigateToFile(fileName, { anchor: targetId, pushHistory: true });
}

function goBack() {
  const previousLocation = navigationHistory.backStack.pop();
  if (!previousLocation) {
    return;
  }

  const currentLocation = getCurrentLocation();
  if (!isSameLocation(currentLocation, previousLocation)) {
    navigationHistory.forwardStack.push(currentLocation);
  }

  restoreLocation(previousLocation);
  updateHistoryButtons();
}

function goForward() {
  const nextLocation = navigationHistory.forwardStack.pop();
  if (!nextLocation) {
    return;
  }

  const currentLocation = getCurrentLocation();
  if (!isSameLocation(currentLocation, nextLocation)) {
    navigationHistory.backStack.push(currentLocation);
  }

  restoreLocation(nextLocation);
  updateHistoryButtons();
}

function renderSidebar() {
  const files = Object.keys(CODE_DATA).filter((name) =>
    name.toLowerCase().includes(state.searchTerm.toLowerCase())
  );

  fileListEl.innerHTML = files.map((fileName) => {
    const file = CODE_DATA[fileName];
    const isActive = fileName === state.activeFile;

    return `
      <div>
        <button class="file-button ${isActive ? "active" : ""}" data-action="file" data-file="${fileName}">
          <span>${isActive ? "▾" : "▸"}</span>
          <img class="class-icon" src="${CLASS_ICON_PATH}" alt="" />
          <span>${fileName}</span>
        </button>
        ${isActive ? `
          <div class="method-list">
            ${file.methods.map((method) => `
              <button class="method-button" data-action="method" data-file="${fileName}" data-method="${method.id}">
                ◦ ${method.name}()
              </button>
            `).join("")}
          </div>
        ` : ""}
      </div>
    `;
  }).join("");
}

function renderTabs() {
  tabsEl.innerHTML = Object.keys(CODE_DATA).map((fileName) => `
    <button class="tab-button ${fileName === state.activeFile ? "active" : ""}" data-action="file" data-file="${fileName}">
      <img class="class-icon" src="${CLASS_ICON_PATH}" alt="" />
      <span>${fileName}</span>
    </button>
  `).join("");
}

function renderCode() {
  const file = CODE_DATA[state.activeFile];
  const lines = file.code.split("\n");

  summaryEl.textContent = file.description;
  footerPathEl.textContent = `src/main/java/com/zaxxer/hikari/${state.activeFile}`;

  codeEl.innerHTML = lines.map((line, idx) => {
    const method = file.methods.find((item) => line.includes(` ${item.name}(`));
    const anchor = file.anchors?.find((item) => line.includes(item.match));
    const lineId = method?.id || anchor?.id || "";
    const lineClass = method ? "method" : "";

    return `
      <div class="code-line ${lineClass}" ${lineId ? `id="${lineId}"` : ""}>
        <span class="line-number">${idx + 1}</span>
        <span class="line-code">${highlightLine(line, state.activeFile)}</span>
      </div>
    `;
  }).join("");
}

function render() {
  renderSidebar();
  renderTabs();
  renderCode();
}

document.body.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (actionTarget) {
    const action = actionTarget.dataset.action;
    const fileName = actionTarget.dataset.file;

    if (action === "file") {
      navigateToFile(fileName, { pushHistory: true });
    }

    if (action === "method") {
      jumpToAnchor(fileName, actionTarget.dataset.method);
    }

    return;
  }

  const navLink = event.target.closest(".class-link, .method-link");
  if (navLink) {
    if (navLink.dataset.anchor) {
      jumpToAnchor(navLink.dataset.file, navLink.dataset.anchor);
      return;
    }

    navigateToFile(navLink.dataset.file, { pushHistory: true });
  }
});

historyBackEl.addEventListener("click", goBack);
historyForwardEl.addEventListener("click", goForward);

searchEl.addEventListener("input", (event) => {
  state.searchTerm = event.target.value;
  renderSidebar();
});

render();
updateHistoryButtons();
