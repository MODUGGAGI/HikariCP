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
  },
  {
    id: "pool-initialization",
    title: "커넥션 풀 초기화",
    description: "Spring Boot에서 기본 생성자로 만든 HikariDataSource가 첫 커넥션 요청 시점에 HikariPool을 지연 초기화하고, 이후 minimumIdle 커넥션을 채우는 흐름을 따라갑니다.",
    steps: [
      {
        file: "HikariDataSource.java",
        anchor: "hds-ctor",
        label: "HikariDataSource()",
        caption: "Spring Boot가 시작되면 HikariDataSource는 기본 생성자로 먼저 초기화됩니다. 이때 fastPathPool은 null로 설정됩니다.\nHikariCP 기본 생성자 경로에서는 지연 초기화 전략을 사용해 실제 pool start가 첫 getConnection() 호출 시점까지 미뤄집니다.",
        delay: 1400
      },
      {
        file: "HikariDataSource.java",
        anchor: "hds-getconn",
        label: "첫 getConnection() 요청",
        caption: "이후 애플리케이션의 첫 커넥션 요청이 들어오면 getConnection()에서 커넥션 풀 초기화가 시작됩니다.",
        delay: 1200
      },
      {
        file: "HikariDataSource.java",
        lineMatch: "HikariPool result = pool;",
        label: "pool 참조 확인",
        caption: "pool은 volatile 필드라 직접 반복해서 읽으면 일반 필드보다 접근 비용이 큽니다. 그래서 먼저 로컬 변수 result에 담아 이후 비교와 반환에 사용합니다.\n아직 초기화되지 않은 상태에서는 pool이 null이므로 result에도 null이 들어갑니다.",
        delay: 1200
      },
      {
        file: "HikariDataSource.java",
        lineMatch: "if (result == null) {",
        lineMatchOccurrence: 1,
        label: "초기화 필요 여부 확인",
        caption: "result가 null이면 아직 커넥션 풀이 만들어지지 않은 상태이므로 초기화 경로로 들어갑니다.",
        delay: 1300
      },
      {
        file: "HikariDataSource.java",
        lineMatch: "synchronized (this) {",
        label: "동기화 진입",
        caption: "여러 스레드가 동시에 첫 요청을 보내도 풀은 한 번만 생성되어야 하므로 synchronized 블록에 진입합니다.\n처음으로 진입한 스레드가 Lock을 획득하고, 다른 스레드는 초기화가 끝날 때까지 대기합니다.",
        delay: 1300
      },
      {
        file: "HikariDataSource.java",
        lineMatch: "result = pool;",
        label: "pool 재확인",
        caption: "락을 획득한 뒤 pool 값을 다시 읽습니다.\n락 밖에서 한 번 확인하고, 락 안에서 다시 한 번 확인하기 때문에 Double-Checked Locking입니다.\n대기하던 다른 스레드가 들어왔을 때 이미 초기화된 pool을 다시 만들지 않기 위한 구조입니다.",
        delay: 1300
      },
      {
        file: "HikariDataSource.java",
        lineMatch: "if (result == null) {",
        lineMatchOccurrence: 2,
        label: "두 번째 null 확인",
        caption: "다시 확인했을 때도 result가 null이면 현재 스레드가 실제 커넥션 풀 초기화를 수행합니다.",
        delay: 1300
      },
      {
        file: "HikariDataSource.java",
        lineMatch: "pool = result = new HikariPool(this);",
        label: "HikariPool 생성",
        caption: "Double-Checked Locking 안에서 HikariPool을 생성하고, pool과 result에 같은 인스턴스를 저장합니다.",
        delay: 1500
      },
      {
        file: "HikariPool.java",
        anchor: "hp-ctor",
        label: "HikariPool(HikariConfig)",
        caption: "풀 초기화의 중심인 HikariPool 생성자에 진입합니다.",
        delay: 1400
      },
      {
        file: "HikariPool.java",
        lineMatch: "super(config);",
        label: "부모 기본 설정 초기화",
        caption: "config 설정을 부모 클래스에 넘겨 기본 설정을 초기화합니다.",
        delay: 1300
      },
      {
        file: "HikariPool.java",
        lineMatch: "this.connectionBag = new ConcurrentBag<>(this);",
        label: "ConcurrentBag 생성",
        caption: "커넥션을 담을 핵심 저장소인 ConcurrentBag을 생성합니다.",
        delay: 1400
      },
      {
        file: "HikariPool.java",
        lineMatch: "this.houseKeepingExecutorService = initializeHouseKeepingExecutorService();",
        label: "HouseKeeper executor 준비",
        caption: "주기적으로 풀을 관리할 housekeeping executor를 준비합니다.",
        delay: 1400
      },
      {
        file: "HikariPool.java",
        lineMatch: "checkFailFast();",
        label: "checkFailFast() 호출",
        caption: "checkFailFast()는 커넥션을 딱 1개만 생성하여 DB 연결 가능 여부를 빠르게 검증하고, 문제가 있을 경우 애플리케이션 초기 단계에서 바로 실패하도록 하기 위한 메서드입니다.",
        delay: 1700
      },
      {
        file: "HikariPool.java",
        anchor: "hp-checkfailfast",
        label: "checkFailFast()",
        caption: "checkFailFast()는 풀 초기화 직후 DB 연결이 가능한지 빠르게 확인하는 메서드입니다. 여기서는 커넥션을 딱 1개만 생성해 초기 실패를 빠르게 감지합니다.",
        delay: 1400
      },
      {
        file: "HikariPool.java",
        lineMatch: "final var poolEntry = createPoolEntry();",
        label: "PoolEntry 생성",
        caption: "PoolEntry를 생성합니다.",
        delay: 1300
      },
      {
        file: "HikariPool.java",
        lineMatch: "connectionBag.add(poolEntry);",
        label: "첫 PoolEntry 추가",
        caption: "생성된 첫 번째 PoolEntry를 ConcurrentBag에 추가합니다.",
        delay: 1400
      },
      {
        file: "ConcurrentBag.java",
        anchor: "cb-add",
        label: "ConcurrentBag.add()",
        caption: "checkFailFast()에서 생성한 첫 PoolEntry가 ConcurrentBag.add()로 들어옵니다.",
        delay: 1500
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "sharedList.add(bagEntry);",
        label: "sharedList에 추가",
        caption: "checkFailFast()에서 생성된 최초 PoolEntry를 sharedList에 추가합니다.\n이 커넥션은 초기 DB 연결 검증에 성공한 첫 커넥션으로 풀에 등록됩니다.",
        delay: 1500
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "while (waiters.get() > 0 && bagEntry.getState() == STATE_NOT_IN_USE && !handoffQueue.offer(bagEntry)) {",
        label: "대기 스레드 확인",
        caption: "checkFailFast() 단계의 add()는 HikariPool 생성자 안에서 최초 커넥션을 검증하는 과정입니다. 아직 pool이 외부에 공개되기 전이므로 대기 중인 스레드가 있을 수 없어 handoffQueue로 전달하지 않습니다.",
        delay: 1600
      },
      {
        file: "HikariPool.java",
        lineMatch: "this.houseKeeperTask = houseKeepingExecutorService.scheduleWithFixedDelay(new HouseKeeper(), 100L, housekeepingPeriodMs, MILLISECONDS);",
        label: "HouseKeeper 등록",
        caption: "checkFailFast()가 완료되면 HikariPool 생성자로 돌아와 HouseKeeper를 등록합니다.\nHouseKeeper는 처음에는 100ms 뒤에 실행되고, 이후에는 housekeepingPeriodMs 주기로 계속 실행됩니다.",
        delay: 1700
      },
      {
        file: "HikariPool.java",
        anchor: "hp-housekeeper-run",
        label: "HouseKeeper.run()",
        caption: "HouseKeeper는 주기적으로 실행되며 풀 상태를 점검합니다. 이 과정에서 최소 idle 커넥션 개수를 유지하도록 필요한 커넥션을 채웁니다.",
        delay: 1500
      },
      {
        file: "HikariPool.java",
        lineMatch: "fillPool(true);",
        label: "fillPool(true) 호출",
        caption: "HouseKeeper 내부에서 fillPool(true)를 실행해 부족한 커넥션을 채우는 단계로 넘어갑니다.",
        delay: 1500
      },
      {
        file: "HikariPool.java",
        anchor: "hp-fillpool",
        label: "fillPool(true)",
        caption: "fillPool()은 현재 풀 상태를 보고 minimumIdle을 유지하기 위해\n커넥션 추가가 필요한지 판단하는 메서드입니다.",
        delay: 1400
      },
      {
        file: "HikariPool.java",
        lineMatches: [
          "final var shouldAdd = getTotalConnections() < config.getMaximumPoolSize() && idle < config.getMinimumIdle();",
          "if (shouldAdd) {"
        ],
        label: "추가 필요 여부 판단",
        caption: "전체 커넥션 수가 maximumPoolSize보다 작고, idle 커넥션 수가 minimumIdle보다 작으면 커넥션 추가가 필요하다고 판단합니다.",
        delay: 1400
      },
      {
        file: "HikariPool.java",
        lineMatch: "final var countToAdd = config.getMinimumIdle() - idle;",
        label: "필요 개수 계산",
        caption: "minimumIdle 기준으로 추가로 필요한 커넥션 개수를 계산합니다.",
        delay: 1300
      },
      {
        file: "HikariPool.java",
        lineMatch: "for (int i = 0; i < countToAdd; i++)",
        label: "1개씩 추가 요청",
        caption: "필요한 커넥션 개수만큼 반복하면서, 한 번에 커넥션 1개 생성 작업을 addConnectionExecutor에 위임합니다.",
        delay: 1500
      },
      {
        file: "HikariPool.java",
        lineMatch: "addConnectionExecutor.submit(isAfterAdd ? postFillPoolEntryCreator : poolEntryCreator);",
        label: "PoolEntryCreator 제출",
        caption: "커넥션 생성은 여기서 동기적으로 직접 실행되지 않습니다.\naddConnectionExecutor에 PoolEntryCreator 작업을 제출하고, 실제 생성은 별도 스레드가 비동기적으로 처리합니다.",
        delay: 1500
      },
      {
        file: "HikariPool.java",
        anchor: "hp-poolentrycreator-call",
        label: "PoolEntryCreator.call()",
        caption: "별도 스레드가 제출된 PoolEntryCreator를 실행하면 call() 메서드에서 PoolEntry 생성을 시도합니다.",
        delay: 1500
      },
      {
        file: "HikariPool.java",
        lineMatch: "final var poolEntry = createPoolEntry();",
        lineMatchOccurrence: 2,
        label: "PoolEntry 생성",
        caption: "PoolEntry를 생성합니다.",
        delay: 1300
      },
      {
        file: "HikariPool.java",
        lineMatch: "connectionBag.add(poolEntry);",
        lineMatchOccurrence: 2,
        label: "ConcurrentBag.add() 호출",
        caption: "PoolEntry가 정상 생성되면 ConcurrentBag의 add() 메서드를 호출해 커넥션 1개를 풀에 추가합니다.",
        delay: 1500
      },
      {
        file: "ConcurrentBag.java",
        anchor: "cb-add",
        label: "ConcurrentBag.add()",
        caption: "HouseKeeper가 fillPool()을 통해 요청한 커넥션 생성 작업은 PoolEntryCreator.call()에서 실행됩니다.\nPoolEntryCreator가 만든 PoolEntry는 결국 ConcurrentBag.add()로 들어옵니다.",
        delay: 1600
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "sharedList.add(bagEntry);",
        label: "sharedList에 추가",
        caption: "이 커넥션도 먼저 sharedList에 추가됩니다. 초기화 과정에서 만들어지는 커넥션은 sharedList에 쌓이면서 idle 커넥션 풀을 구성합니다.",
        delay: 1500
      },
      {
        file: "ConcurrentBag.java",
        lineMatch: "while (waiters.get() > 0 && bagEntry.getState() == STATE_NOT_IN_USE && !handoffQueue.offer(bagEntry)) {",
        label: "handoffQueue 전달 시도",
        caption: "초기화 중 커넥션을 1개씩 추가하는 순간에 어떤 스레드가 커넥션을 기다리고 있다면, handoffQueue.offer()로 즉시 전달을 시도합니다.",
        delay: 1600
      },
      {
        file: "HikariDataSource.java",
        lineMatch: "this.seal();",
        lineMatchOccurrence: 2,
        label: "설정 변경 차단",
        caption: "HikariPool 생성 후 HikariDataSource로 돌아와 seal() 메서드를 호출합니다. seal()은 초기화 이후 설정 변경을 막습니다.",
        delay: 1500
      }
    ]
  }
];
