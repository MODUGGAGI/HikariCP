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
         throw new SQLException("HikariDataSource has been closed.");
      }

      // Spring Boot 사용 시 보통 fastPathPool에서 커넥션을 가져옵니다.
      if (fastPathPool != null) {
         return fastPathPool.getConnection();
      }

      return getPool().getConnection();
   }
}`,
    methods: [{ name: "getConnection", id: "hds-getconn" }]
  },
  "HikariPool.java": {
    id: "hp",
    description: "실제 커넥션 풀을 관리하며 대기 및 시간 초과 로직을 처리합니다.",
    code: `public final class HikariPool extends PoolBase implements HikariPoolMXBean, IBagStateListener {
   private final PoolEntryCreator poolEntryCreator = new PoolEntryCreator();
   private final ConcurrentBag<PoolEntry> connectionBag; // ✅ 커넥션이 담겨 있는 실제 보관함

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

            if (poolEntry == null) break;

            final var now = currentTime();
            if (poolEntry.isMarkedEvicted() || (elapsedMillis(poolEntry.lastAccessed, now) > 30000
                && isConnectionDead(poolEntry.connection))) {
               closeConnection(poolEntry, "Dead or Evicted");
               timeout = hardTimeout - elapsedMillis(startTime);
            } else {
               // ✅ 최종적으로 HikariProxyConnection으로 감싸서 반환합니다.
               return poolEntry.createProxyConnection(leakTaskFactory.schedule(poolEntry));
            }
         } while (timeout > 0L);

         throw new SQLException("Timeout");
      } finally {
         suspendResumeLock.release();
      }
   }

   /**
    * ✅ Connection 반납 시 호출되는 메서드
    */
   void recycle(final PoolEntry poolEntry) {
      if (poolEntry.isMarkedEvicted()) {
         closeConnection(poolEntry, "Evicted");
      } else {
         connectionBag.requite(poolEntry); // ✅ 다시 ConcurrentBag으로 반납
      }
   }
}`,
    methods: [
      { name: "getConnection", id: "hp-getconn" },
      { name: "recycle", id: "hp-recycle" }
    ]
  },
  "ConcurrentBag.java": {
    id: "cb",
    description: "HikariCP 성능의 핵심으로, Lock-free 지향적인 커넥션 보관 구조입니다.",
    code: `public class ConcurrentBag<T extends IConcurrentBagEntry> implements AutoCloseable {
   private final CopyOnWriteArrayList<T> sharedList;
   private final ThreadLocal<List<Object>> threadLocalList; // ✅ 스레드별 커넥션 캐시
   private final SynchronousQueue<T> handoffQueue;

   /**
    * ✅ 커넥션 획득 로직 (borrow)
    */
   public T borrow(long timeout, final TimeUnit timeUnit) throws InterruptedException {
      // 1️⃣ ThreadLocal 캐시에서 먼저 찾기
      final var list = threadLocalList.get();
      for (var i = list.size() - 1; i >= 0; i--) {
         const entry = list.remove(i);
         const bagEntry = (T) entry;
         if (bagEntry != null && bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
            return bagEntry;
         }
      }

      // 2️⃣ sharedList (전체 목록) 스캔 및 CAS 시도
      const waiting = waiters.incrementAndGet();
      try {
         for (T bagEntry : sharedList) {
            if (bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
               if (waiting > 1) listener.addBagItem(waiting - 1);
               return bagEntry;
            }
         }

         // 3️⃣ handoffQueue에서 대기
         listener.addBagItem(waiting);
         timeout = timeUnit.toNanos(timeout);
         do {
            const start = currentTime();
            const bagEntry = handoffQueue.poll(timeout, NANOSECONDS);
            if (bagEntry == null || bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {
               return bagEntry;
            }
            timeout -= elapsedNanos(start);
         } while (timeout > 10_000);

         return null;
      } finally {
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
         Thread.yield();
      }

      const threadLocalEntries = this.threadLocalList.get();
      if (threadLocalEntries.size() < 16) {
         threadLocalEntries.add(bagEntry);
      }
   }
}`,
    methods: [
      { name: "borrow", id: "cb-borrow" },
      { name: "requite", id: "cb-requite" }
    ]
  },
  "PoolEntry.java": {
    id: "pe",
    description: "커넥션 객체와 그 상태를 관리하는 핵심 래퍼 클래스입니다.",
    code: `final class PoolEntry implements IConcurrentBagEntry {
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
}`,
    methods: [{ name: "recycle", id: "pe-recycle" }]
  }
};

const KEYWORDS = new Set([
  "public", "private", "protected", "final", "volatile", "class", "extends",
  "implements", "interface", "new", "return", "if", "else", "do", "while",
  "for", "try", "catch", "finally", "throw", "throws", "var", "int", "long",
  "boolean", "void", "static", "const"
]);

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

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function highlightLine(line) {
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
  const masterRegex = /("(?:\\.|[^\\"])*")|(@\w+)|(\b\w+\b)|([^\w\s]+)|(\s+)/g;

  const formattedCode = codePart.replace(
    masterRegex,
    (match, string, annotation, word, operator, space) => {
      if (string) return `<span class="string">${escapeHtml(string)}</span>`;
      if (annotation) return `<span class="anno">${escapeHtml(annotation)}</span>`;
      if (word) {
        if (KEYWORDS.has(word)) return `<span class="kw">${word}</span>`;
        if (classNames.includes(word)) {
          return `<span class="class-link" data-file="${word}.java">${word}</span>`;
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

function jumpToMethod(fileName, methodId) {
  setActiveFile(fileName);

  requestAnimationFrame(() => {
    const target = document.getElementById(methodId);
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("highlight");
    window.setTimeout(() => target.classList.remove("highlight"), 1500);
  });
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
          <span class="file-icon">📄</span>
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
      📄 ${fileName}
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
    const lineId = method ? method.id : "";

    return `
      <div class="code-line ${lineId ? "method" : ""}" ${lineId ? `id="${lineId}"` : ""}>
        <span class="line-number">${idx + 1}</span>
        <span class="line-code">${highlightLine(line)}</span>
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
      setActiveFile(fileName);
    }

    if (action === "method") {
      jumpToMethod(fileName, actionTarget.dataset.method);
    }

    return;
  }

  const classLink = event.target.closest(".class-link");
  if (classLink) {
    setActiveFile(classLink.dataset.file);
  }
});

searchEl.addEventListener("input", (event) => {
  state.searchTerm = event.target.value;
  renderSidebar();
});

render();
