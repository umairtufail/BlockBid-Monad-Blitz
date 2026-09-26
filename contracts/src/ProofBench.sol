// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ProofBench — open adversarial benchmark for AI agents
/// @notice Stakes, results, rewards, and reputation on-chain. Payloads stay off-chain.
contract ProofBench {
    enum AttackStatus {
        None,
        Pending,
        Defended,
        Breached,
        Paid
    }

    struct Benchmark {
        bytes32 targetModelHash;
        string version;
        address creator;
        uint256 rewardPool;
        bool exists;
    }

    struct Attack {
        uint256 benchmarkId;
        address attacker;
        bytes32 attackHash;
        uint256 stake;
        uint64 timestamp;
        AttackStatus status;
        bool breached;
        bytes32 resultHash;
        uint256 reward;
    }

    uint256 public nextBenchmarkId = 1;
    uint256 public nextAttackId = 1;
    uint256 public minStake;
    address public reporter;
    /// @notice Reward = stake * rewardMultiplierBps / 10_000 (default 8x).
    uint256 public rewardMultiplierBps = 80_000;

    mapping(uint256 => Benchmark) public benchmarks;
    mapping(uint256 => Attack) public attacks;
    mapping(address => int256) public reputation;
    mapping(address => uint256) public successfulAttacks;
    mapping(address => uint256) public falseClaims;

    event BenchmarkCreated(
        uint256 indexed benchmarkId,
        bytes32 targetModelHash,
        string version,
        address indexed creator
    );
    event AttackSubmitted(
        uint256 indexed attackId,
        uint256 indexed benchmarkId,
        address indexed attacker,
        bytes32 attackHash,
        uint256 stake
    );
    event ResultReported(
        uint256 indexed attackId,
        bool breached,
        bytes32 resultHash,
        int256 reputationDelta
    );
    event RewardPaid(uint256 indexed attackId, address indexed attacker, uint256 amount);
    event RewardPoolFunded(uint256 indexed benchmarkId, uint256 amount);
    event ReporterUpdated(address indexed reporter);

    error BadStake();
    error BadBenchmark();
    error BadAttack();
    error NotReporter();
    error NotPending();
    error NotBreached();
    error AlreadyPaid();
    error EmptyHash();
    error TransferFailed();
    error InsufficientPool();

    constructor(uint256 minStake_, address reporter_) {
        require(minStake_ > 0, "min stake");
        require(reporter_ != address(0), "reporter");
        minStake = minStake_;
        reporter = reporter_;
        // Seed default ResearchAgent benchmark
        _createBenchmark(keccak256("ResearchAgent-v1.3"), "v1.3");
    }

    receive() external payable {
        // Unallocated ETH goes to benchmark 1 pool if it exists
        if (benchmarks[1].exists) {
            benchmarks[1].rewardPool += msg.value;
            emit RewardPoolFunded(1, msg.value);
        }
    }

    function setReporter(address reporter_) external {
        if (msg.sender != reporter) revert NotReporter();
        require(reporter_ != address(0), "reporter");
        reporter = reporter_;
        emit ReporterUpdated(reporter_);
    }

    function createBenchmark(bytes32 targetModelHash, string calldata version)
        external
        returns (uint256 benchmarkId)
    {
        return _createBenchmark(targetModelHash, version);
    }

    function fundBenchmark(uint256 benchmarkId) external payable {
        if (!benchmarks[benchmarkId].exists) revert BadBenchmark();
        if (msg.value == 0) revert BadStake();
        benchmarks[benchmarkId].rewardPool += msg.value;
        emit RewardPoolFunded(benchmarkId, msg.value);
    }

    function submitAttack(uint256 benchmarkId, bytes32 attackHash)
        external
        payable
        returns (uint256 attackId)
    {
        if (!benchmarks[benchmarkId].exists) revert BadBenchmark();
        if (msg.value < minStake) revert BadStake();
        if (attackHash == bytes32(0)) revert EmptyHash();

        attackId = nextAttackId++;
        attacks[attackId] = Attack({
            benchmarkId: benchmarkId,
            attacker: msg.sender,
            attackHash: attackHash,
            stake: msg.value,
            timestamp: uint64(block.timestamp),
            status: AttackStatus.Pending,
            breached: false,
            resultHash: bytes32(0),
            reward: 0
        });

        emit AttackSubmitted(attackId, benchmarkId, msg.sender, attackHash, msg.value);
    }

    /// @notice Trusted reporter finalizes off-chain verification (MVP).
    function reportResult(uint256 attackId, bool breached, bytes32 resultHash) external {
        if (msg.sender != reporter) revert NotReporter();
        Attack storage a = attacks[attackId];
        if (a.status != AttackStatus.Pending) revert NotPending();
        if (resultHash == bytes32(0)) revert EmptyHash();

        a.breached = breached;
        a.resultHash = resultHash;
        a.status = breached ? AttackStatus.Breached : AttackStatus.Defended;

        int256 delta;
        if (breached) {
            delta = 12;
            reputation[a.attacker] += delta;
            successfulAttacks[a.attacker] += 1;
            // Escrow stake into benchmark reward pool; reward claimed separately
            benchmarks[a.benchmarkId].rewardPool += a.stake;
            a.reward = (a.stake * rewardMultiplierBps) / 10_000;
        } else {
            delta = 0;
            // Failed claim: stake retained in contract as protocol/security sink
            falseClaims[a.attacker] += 1;
        }

        emit ResultReported(attackId, breached, resultHash, delta);
    }

    function claimReward(uint256 attackId) external {
        Attack storage a = attacks[attackId];
        if (a.attacker != msg.sender) revert BadAttack();
        if (a.status == AttackStatus.Paid) revert AlreadyPaid();
        if (a.status != AttackStatus.Breached) revert NotBreached();

        uint256 amount = a.reward;
        Benchmark storage b = benchmarks[a.benchmarkId];
        if (b.rewardPool < amount) revert InsufficientPool();

        b.rewardPool -= amount;
        a.status = AttackStatus.Paid;
        a.reward = 0;

        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit RewardPaid(attackId, msg.sender, amount);
    }

    function getAttack(uint256 attackId)
        external
        view
        returns (
            uint256 benchmarkId,
            address attacker,
            bytes32 attackHash,
            uint256 stake,
            uint64 timestamp,
            AttackStatus status,
            bool breached,
            bytes32 resultHash,
            uint256 reward
        )
    {
        Attack storage a = attacks[attackId];
        return (
            a.benchmarkId,
            a.attacker,
            a.attackHash,
            a.stake,
            a.timestamp,
            a.status,
            a.breached,
            a.resultHash,
            a.reward
        );
    }

    function _createBenchmark(bytes32 targetModelHash, string memory version)
        internal
        returns (uint256 benchmarkId)
    {
        benchmarkId = nextBenchmarkId++;
        benchmarks[benchmarkId] = Benchmark({
            targetModelHash: targetModelHash,
            version: version,
            creator: msg.sender,
            rewardPool: 0,
            exists: true
        });
        emit BenchmarkCreated(benchmarkId, targetModelHash, version, msg.sender);
    }
}
