// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AdSlotAuction} from "../src/AdSlotAuction.sol";

contract AdSlotAuctionTest is Test {
    AdSlotAuction internal auction;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    uint256 internal constant DURATION = 10;

    function setUp() public {
        auction = new AdSlotAuction(DURATION);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function test_firstBidBecomesLeader() public {
        vm.prank(alice);
        auction.bid{value: 1 ether}();
        assertEq(auction.highestBidder(), alice);
        assertEq(auction.highestBid(), 1 ether);
    }

    function test_lowerBidReverts() public {
        vm.prank(alice);
        auction.bid{value: 1 ether}();

        vm.prank(bob);
        vm.expectRevert(AdSlotAuction.BidTooLow.selector);
        auction.bid{value: 1 ether}();
    }

    function test_outbidRefundsPrevious() public {
        vm.prank(alice);
        auction.bid{value: 1 ether}();
        uint256 aliceBefore = alice.balance;

        vm.prank(bob);
        auction.bid{value: 2 ether}();

        assertEq(auction.highestBidder(), bob);
        assertEq(alice.balance, aliceBefore + 1 ether);
    }

    function test_bidAfterEndReverts() public {
        vm.prank(alice);
        auction.bid{value: 1 ether}();

        vm.roll(block.number + DURATION + 1);

        vm.prank(bob);
        vm.expectRevert(AdSlotAuction.RoundAlreadyEnded.selector);
        auction.bid{value: 2 ether}();
    }

    function test_settleBeforeEndReverts() public {
        vm.expectRevert(AdSlotAuction.RoundNotEnded.selector);
        auction.settle();
    }

    function test_settleAndSetAd() public {
        vm.prank(alice);
        auction.bid{value: 1 ether}();

        vm.roll(block.number + DURATION + 1);
        auction.settle();

        assertEq(auction.pendingWinner(), alice);
        assertEq(auction.roundId(), 2);

        vm.prank(alice);
        auction.setAd("50% OFF MONAD", "https://monad.xyz");

        assertEq(auction.headline(), "50% OFF MONAD");
        assertEq(auction.link(), "https://monad.xyz");
        assertTrue(auction.adSetForRound());
    }

    function test_setAdByNonWinnerReverts() public {
        vm.prank(alice);
        auction.bid{value: 1 ether}();
        vm.roll(block.number + DURATION + 1);
        auction.settle();

        vm.prank(bob);
        vm.expectRevert(AdSlotAuction.NotPendingWinner.selector);
        auction.setAd("hack", "https://evil.example");
    }

    function test_setAdTwiceReverts() public {
        vm.prank(alice);
        auction.bid{value: 1 ether}();
        vm.roll(block.number + DURATION + 1);
        auction.settle();

        vm.prank(alice);
        auction.setAd("ONE", "https://a.example");

        vm.prank(alice);
        vm.expectRevert(AdSlotAuction.AdAlreadySet.selector);
        auction.setAd("TWO", "https://b.example");
    }

    function test_emptyHeadlineReverts() public {
        vm.prank(alice);
        auction.bid{value: 1 ether}();
        vm.roll(block.number + DURATION + 1);
        auction.settle();

        vm.prank(alice);
        vm.expectRevert(AdSlotAuction.EmptyHeadline.selector);
        auction.setAd("", "https://a.example");
    }

    function test_nextRoundAcceptsBids() public {
        vm.prank(alice);
        auction.bid{value: 1 ether}();
        vm.roll(block.number + DURATION + 1);
        auction.settle();

        vm.prank(bob);
        auction.bid{value: 0.5 ether}();
        assertEq(auction.highestBidder(), bob);
        assertEq(auction.roundId(), 2);
    }
}
