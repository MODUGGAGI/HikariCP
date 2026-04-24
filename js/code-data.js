export const CODE_DATA = {
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
      if (waiting > addConnectionExecutor.getQueue().size()) {
         addConnectionExecutor.submit(poolEntryCreator);
      }
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
  "HikariProxyConnection.java": {
    id: "hpc",
    description: "애플리케이션에 반환되는 커넥션 프록시로, close() 시 실제 반납 절차를 시작합니다.",
    code: `public final class HikariProxyConnection extends ProxyConnection implements Wrapper, AutoCloseable, Connection {
    
   @Override
   public final void close() throws SQLException
   {
      // Closing statements can cause connection eviction, so this must run before the conditional below
      closeStatements();

      if (delegate != ClosedConnection.CLOSED_CONNECTION) {
         leakTask.cancel();

         try {
            if (isCommitStateDirty && !isAutoCommit) {
               delegate.rollback();
               LOGGER.debug("{} - Executed rollback on connection {} due to dirty commit state on close().", poolEntry.getPoolName(), delegate);
            }

            if (dirtyBits != 0) {
               poolEntry.resetConnectionState(this, dirtyBits);
            }

            delegate.clearWarnings();
         }
         catch (SQLException e) {
            // when connections are aborted, exceptions are often thrown that should not reach the application
            if (!poolEntry.isMarkedEvicted()) {
               throw checkException(e);
            }
         }
         finally {
            delegate = ClosedConnection.CLOSED_CONNECTION;
            poolEntry.recycle();
         }
      }
   }
}`,
    methods: [
      { name: "close", id: "hpc-close" }
    ]
  },
  "PoolEntry.java": {
    id: "pe",
    description: "커넥션 객체와 그 상태를 관리하는 핵심 래퍼 클래스입니다.",
    code: `final class PoolEntry implements IConcurrentBagEntry {
    
   private static final AtomicIntegerFieldUpdater<PoolEntry> stateUpdater;
    
   Connection connection;
   long lastAccessed;
   
   @SuppressWarnings("FieldCanBeLocal")
   private volatile int state = 0;
   private volatile boolean evict;
   
   private final HikariPool hikariPool;
   
   private final boolean isReadOnly;
   private final boolean isAutoCommit;

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

export const KEYWORDS = new Set([
  "public", "private", "protected", "final", "volatile", "class", "extends",
  "implements", "interface", "new", "return", "if", "else", "do", "while",
  "for", "try", "catch", "finally", "throw", "throws", "var", "int", "long",
  "boolean", "void", "static", "const"
]);

export const CLASS_ICON_PATH = "./image/class_icon.png";

export const SYMBOL_LINKS = {
  IConcurrentBagEntry: {
    file: "ConcurrentBag.java",
    anchor: "cb-iconcurrentbagentry"
  }
};

export const FILE_PRIMARY_TYPES = {
  "HikariDataSource.java": "HikariDataSource",
  "HikariPool.java": "HikariPool",
  "ConcurrentBag.java": "ConcurrentBag",
  "HikariProxyConnection.java": "HikariProxyConnection",
  "PoolEntry.java": "PoolEntry"
};

export const TYPE_METHOD_LINKS = {
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
  HikariProxyConnection: {
    close: { file: "HikariProxyConnection.java", anchor: "hpc-close" }
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

export const TYPE_MEMBER_TYPES = {
  HikariDataSource: {
    fastPathPool: "HikariPool",
    pool: "HikariPool"
  },
  HikariPool: {
    connectionBag: "ConcurrentBag"
  },
  HikariProxyConnection: {
    poolEntry: "PoolEntry"
  },
  PoolEntry: {
    hikariPool: "HikariPool"
  }
};

export const MANUAL_TYPE_CONTEXTS = {
  "HikariProxyConnection.java": {
    poolEntry: "PoolEntry"
  },
  "ConcurrentBag.java": {
    bagEntry: "PoolEntry",
    listener: "HikariPool"
  }
};

export const KNOWN_TYPES = [...Object.values(FILE_PRIMARY_TYPES), "IConcurrentBagEntry"];

export const TYPE_CONTEXTS = Object.fromEntries(
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
