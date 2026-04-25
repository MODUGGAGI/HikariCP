export const SCENARIOS = [
  {
    id: "connection-request",
    title: "커넥션 요청 시작",
    description: "HikariDataSource에서 시작해 ConcurrentBag, PoolEntry를 거쳐 최종 Connection 반환까지의 흐름을 따라갑니다.",
    steps: [
      {
        file: "HikariDataSource.java",
        anchor: "hds-getconn",
        label: "HikariDataSource.getConnection()",
        caption: "커넥션 요청은 HikariDataSource.getConnection()에서 시작됩니다.",
        delay: 1400
      },
      {
        file: "HikariDataSource.java",
        lineMatch: "HikariPool result = pool;",
        label: "pool 참조 확보",
        caption: "Spring Boot 자동 구성은 기본 생성자를 사용하므로 fastPathPool은 null입니다.\n volatile 타입 pool 변수를 로컬 변수 result에 담아 참조를 가져옵니다.",
        delay: 1200
      },
      {
        file: "HikariDataSource.java",
        lineMatch: "if (result == null) {",
        label: "pool 초기화 여부 확인",
        caption: "커넥션 획득 시점에는 이미 풀이 초기화되어 있으므로 result는 null이 아닙니다. 이 조건은 false가 되어 바로 다음으로 넘어갑니다.",
        delay: 1300
      },
      {
        file: "HikariDataSource.java",
        lineMatch: "return result.getConnection();",
        label: "HikariPool.getConnection() 호출",
        caption: "풀이 준비되었으면 result.getConnection()으로 HikariPool에 커넥션 획득을 위임합니다.",
        delay: 1500
      },
      {
        file: "HikariPool.java",
        anchor: "hp-getconn",
        label: "HikariPool.getConnection()",
        caption: "HikariPool의 첫 번째 getConnection()은 타임아웃 값을 채워 넣는 진입점입니다.",
        delay: 1400
      },
      {
        file: "HikariPool.java",
        lineMatch: "return getConnection(connectionTimeout);",
        label: "getConnection(long) 호출",
        caption: "내부 오버로딩 메서드 getConnection(long hardTimeout) 호출로 흐름이 이어집니다.",
        delay: 1400
      },
      {
        file: "HikariPool.java",
        anchor: "hp-getconn-2",
        label: "HikariPool.getConnection(long)",
        caption: "실제 풀 대기와 커넥션 획득 로직은 두 번째 getConnection(long hardTimeout)에서 처리됩니다.",
        delay: 1600
      },
      {
        file: "HikariPool.java",
        lineMatch: "var poolEntry = connectionBag.borrow(timeout, MILLISECONDS);",
        label: "connectionBag.borrow() 호출",
        caption: "이 시점에 ConcurrentBag.borrow()를 호출해 PoolEntry를 빌리려 시도합니다.",
        delay: 1600
      },
      {
        file: "ConcurrentBag.java",
        anchor: "cb-borrow",
        label: "ConcurrentBag.borrow()",
        caption: "ConcurrentBag.borrow()가 threadLocalList, sharedList, handoffQueue 순으로 커넥션 탐색을 시작합니다.",
        delay: 1600
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "final var list = threadLocalList.get();",
        label: "threadLocalList 조회",
        caption: "가장 먼저 threadLocalList(캐시)에 있는 커넥션 목록을 가져옵니다.",
        delay: 1200
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "final var entry = list.remove(i);",
        label: "캐시 엔트리 꺼내기",
        caption: "캐시에 커넥션이 있다면 해당 커넥션을 제거하며 가져옵니다.",
        delay: 1200
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "if (bagEntry != null && bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {",
        label: "threadLocal CAS 시도",
        caption: "가져온 커넥션이 비어 있지 않고 CAS를 통해 해당 PoolEntry의 점유에 성공하면???",
        delay: 1500
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "return bagEntry;",
        label: "threadLocal 엔트리 반환",
        caption: "해당 커넥션(PoolEntry)을 바로 반환하고 borrow()는 종료됩니다.",
        lineMatchOccurrence: 1,
        delay: 1400
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "for (T bagEntry : sharedList) {",
        label: "sharedList 탐색",
        caption: "만약 캐시에서 찾지 못한 경우 다음으로 sharedList를 순회합니다.",
        delay: 1400
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "if (bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {",
        label: "sharedList CAS 시도",
        caption: "순회하며 커넥션들에 대해서 CAS를 통해 점유를 성공하면???",
        delay: 1500
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "return bagEntry;",
        label: "sharedList 엔트리 반환",
        caption: "해당 커넥션(PoolEntry)을 바로 반환하고 borrow()는 종료됩니다.",
        lineMatchOccurrence: 2,
        delay: 1500
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "listener.addBagItem(waiting);",
        label: "listener.addBagItem() 요청",
        caption: "threadLocalList, sharedList 모두에서 커넥션 점유에 실패하면, 현재 사용 가능한 커넥션이 없는 상황입니다.\n따라서 listener에 새 커넥션 추가를 요청하고 handoffQueue 대기로 넘어갑니다.",
        delay: 1600
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "final T bagEntry = handoffQueue.poll(timeout, NANOSECONDS);",
        label: "handoffQueue 대기",
        caption: "handoffQueue에서 timeout만큼 대기하며 커넥션을 가져옵니다.",
        delay: 1700
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "if (bagEntry == null || bagEntry.compareAndSet(STATE_NOT_IN_USE, STATE_IN_USE)) {",
        label: "handoffQueue CAS 시도",
        caption: "가져온 커넥션이 null이 아니고 CAS를 통해 점유에 성공하면???",
        delay: 1700
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "return bagEntry;",
        label: "handoffQueue 엔트리 반환",
        caption: "해당 커넥션(PoolEntry)을 바로 반환하고 borrow()는 종료됩니다.",
        lineMatchOccurrence: 3,
        delay: 1700
      },
      {
        file: "HikariPool.java",
        lineMatch: "if (poolEntry == null) {",
        label: "timeout 여부 확인",
        caption: "borrow()가 끝나면 HikariPool로 돌아와 먼저 timeout으로 null이 왔는지 확인합니다.",
        delay: 1400
      },
      {
        file: "HikariPool.java",
        lineMatch: "if (poolEntry.isMarkedEvicted() || (elapsedMillis(poolEntry.lastAccessed, now) > aliveBypassWindowMs && isConnectionDead(poolEntry.connection))) {",
        label: "PoolEntry 유효성 검사",
        caption: "그다음 빌려온 PoolEntry가 사용 가능한지 검사합니다.",
        delay: 1600
      },
      {
        file: "HikariPool.java",
        lineMatch: "metricsTracker.recordBorrowStats(poolEntry, startTime);",
        label: "borrow 통계 기록",
        caption: "정상이라면 borrow 통계를 기록하고 하며 커넥션 반환 준비를 합니다.",
        delay: 1300
      },
      {
        file: "HikariPool.java",
        lineMatch: "return poolEntry.createProxyConnection(leakTaskFactory.schedule(poolEntry));",
        label: "ProxyConnection 생성",
        caption: "마지막으로 PoolEntry를 HikariProxyConnection으로 감싸서 호출자에게 반환합니다.",
        delay: 1700
      },
      {
        file: "HikariDataSource.java",
        lineMatch: "return result.getConnection();",
        label: "HikariDataSource로 복귀",
        caption: "HikariPool이 만든 ProxyConnection이 다시 HikariDataSource를 통해 애플리케이션으로 전달됩니다.",
        delay: 1700
      },
      {
        file: "HikariDataSource.java",
        anchor: "hds-getconn",
        label: "최종 Connection 반환",
        caption: "이렇게 호출한 쪽에서는 Connection 프록시를 얻게 됩니다.",
        delay: 1800
      }
    ]
  },
  {
    id: "connection-return",
    title: "커넥션 반납 시작",
    description: "HikariProxyConnection.close()에서 시작해 PoolEntry.recycle(), HikariPool.recycle(), ConcurrentBag.requite()를 거쳐 캐시에 다시 넣는 대표 반납 흐름을 따라갑니다.",
    steps: [
      {
        file: "HikariProxyConnection.java",
        anchor: "hpc-close",
        label: "HikariProxyConnection.close()",
        caption: "커넥션 반납은 애플리케이션이 HikariProxyConnection.close()를 호출하면서 시작됩니다.",
        delay: 1400
      },
      {
        file: "HikariProxyConnection.java",
        lineMatches: [
          "closeStatements();",
          "delegate.rollback();",
          "poolEntry.resetConnectionState(this, dirtyBits);",
          "delegate.clearWarnings();"
        ],
        label: "반납 전 상태 정리",
        caption: "poolEntry.recycle()에 들어가기 전에는 Statement, 트랜잭션 상태, 커넥션 상태를 한 번 정리합니다.",
        delay: 1700
      },
      {
        file: "HikariProxyConnection.java",
        lineMatch: "poolEntry.recycle();",
        label: "poolEntry.recycle() 호출",
        caption: "정리 후 PoolEntry.recycle()을 호출해 풀 반납 절차를 본격적으로 시작합니다.",
        delay: 1600
      },
      {
        file: "PoolEntry.java",
        anchor: "pe-recycle",
        label: "PoolEntry.recycle()",
        caption: "PoolEntry.recycle()입니다.",
        delay: 1400
      },
      {
        file: "PoolEntry.java",
        lineMatch: "if (connection != null) {",
        label: "커넥션 존재 확인",
        caption: "먼저 커넥션이 살아 있는지 확인합니다.",
        delay: 1200
      },
      {
        file: "PoolEntry.java",
        lineMatch: "hikariPool.recycle(this);",
        label: "HikariPool.recycle() 호출",
        caption: "그 후 자신을 관리하는 HikariPool에 반납을 위임합니다.",
        delay: 1500
      },
      {
        file: "HikariPool.java",
        anchor: "hp-recycle",
        label: "HikariPool.recycle()",
        caption: "HikariPool.recycle()은 반납된 PoolEntry를 다시 풀에 넣을지, 폐기할지 결정합니다.",
        delay: 1500
      },
      {
        file: "HikariPool.java",
        lineMatch: "if (poolEntry.isMarkedEvicted()) {",
        label: "evict 여부 확인",
        caption: "evict 대상일 경우???",
        delay: 1400
      },
      {
        file: "HikariPool.java",
        lineMatch: "closeConnection(poolEntry, EVICTED_CONNECTION_MESSAGE);",
        label: "커넥션 종료",
        caption: "커넥션을 종료합니다.",
        delay: 1400
      },
      {
        file: "HikariPool.java",
        lineMatch: "connectionBag.requite(poolEntry);",
        label: "connectionBag.requite() 호출",
        caption: "종료 대상이 아닐 경우, ConcurrentBag.requite()를 통해 커넥션을 다시 사용 가능 상태로 돌려놓습니다.",
        delay: 1500
      },
      {
        file: "ConcurrentBag.java",
        anchor: "cb-requite",
        label: "ConcurrentBag.requite()",
        caption: "ConcurrentBag.requite()는 PoolEntry를 STATE_NOT_IN_USE로 상태로 되돌리고 반납 위치를 결정합니다.",
        delay: 1500
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "bagEntry.setState(STATE_NOT_IN_USE);",
        label: "STATE_NOT_IN_USE 설정",
        caption: "먼저 PoolEntry 상태를 다시 STATE_NOT_IN_USE로 바꿉니다.",
        delay: 1400
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "if (bagEntry.getState() != STATE_NOT_IN_USE || handoffQueue.offer(bagEntry)) {",
        label: "handoffQueue 전달 시도",
        caption: "1. PoolEntry 상태가 이미 STATE_NOT_IN_USE가 아니면 바로 종료합니다.\n2. 아직 STATE_NOT_IN_USE 상태이고 handoffQueue로 즉시 전달에 성공해도 바로 종료합니다.",
        delay: 1600
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "final var threadLocalEntries = this.threadLocalList.get();",
        label: "threadLocalList 확보",
        caption: "커넥션 대기자가 없거나 handoffQueue로 넘기는 데 실패하면, 스레드 캐시(threadLocalList)에 넣는 것을 시도합니다.",
        delay: 1500
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "threadLocalEntries.add(useWeakThreadLocals ? new WeakReference<>(bagEntry) : bagEntry);",
        label: "threadLocal 캐시에 저장",
        caption: "현재 캐시의 크기가 16보다 작으면 PoolEntry를 threadLocalList에 추가합니다.",
        delay: 1600
      }
    ]
  }
];
