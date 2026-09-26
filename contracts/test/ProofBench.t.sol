// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ProofBench} from "../src/ProofBench.sol";

contract ProofBenchTest is Test {
    ProofBench internal bench;
    address internal reporter;
    address internal attacker;

    function setUp() public {
        reporter = makeAddr("reporter");
        attacker = makeAddr("attacker");
        bench = new ProofBench(0.01 ether, reporter);
        vm.deal(address(this), 100 ether);
        vm.deal(attacker, 10 ether);
        bench.fundBenchmark{value: 5 ether}(1);
    }

    function test_submitAndDefend() public {
        bytes32 hash = keccak256("attack-defended");
        vm.prank(attacker);
        uint256 id = bench.submitAttack{value: 0.01 ether}(1, hash);
        assertEq(id, 1);

        vm.prank(reporter);
        bench.reportResult(id, false, keccak256("result-defended"));

        (,,,,, ProofBench.AttackStatus status, bool breached,,) = bench.getAttack(id);
        assertEq(uint8(status), uint8(ProofBench.AttackStatus.Defended));
        assertFalse(breached);
        assertEq(bench.reputation(attacker), 0);
    }

    function test_submitBreachRewardAndReputation() public {
        bytes32 hash = keccak256("attack-breach");
        vm.prank(attacker);
        uint256 id = bench.submitAttack{value: 0.01 ether}(1, hash);

        vm.prank(reporter);
        bench.reportResult(id, true, keccak256("result-breach"));

        assertEq(bench.reputation(attacker), 12);
        assertEq(bench.successfulAttacks(attacker), 1);

        uint256 beforeBal = attacker.balance;
        vm.prank(attacker);
        bench.claimReward(id);
        assertEq(attacker.balance - beforeBal, 0.08 ether);

        (,,,,, ProofBench.AttackStatus status,,,) = bench.getAttack(id);
        assertEq(uint8(status), uint8(ProofBench.AttackStatus.Paid));
    }

    function test_onlyReporter() public {
        vm.prank(attacker);
        uint256 id = bench.submitAttack{value: 0.01 ether}(1, keccak256("x"));
        vm.prank(attacker);
        vm.expectRevert(ProofBench.NotReporter.selector);
        bench.reportResult(id, true, keccak256("y"));
    }
}
