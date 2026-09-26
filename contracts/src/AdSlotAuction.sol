// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AdSlotAuction — live micro-auction for an onchain billboard slot
/// @notice Highest bidder each round wins the right to set the ad creative.
contract AdSlotAuction {
    uint256 public immutable roundDurationBlocks;

    uint256 public roundId;
    uint256 public highestBid;
    address public highestBidder;
    uint256 public endBlock;

    string public headline;
    string public link;

    address public pendingWinner;
    bool public adSetForRound;

    event Bid(uint256 indexed roundId, address indexed bidder, uint256 amount);
    event Settled(uint256 indexed roundId, address indexed winner, uint256 amount);
    event AdSet(uint256 indexed roundId, address indexed advertiser, string headline, string link);
    event RoundStarted(uint256 indexed roundId, uint256 endBlock);

    error BidTooLow();
    error RoundNotEnded();
    error RoundAlreadyEnded();
    error NotPendingWinner();
    error AdAlreadySet();
    error EmptyHeadline();
    error TransferFailed();

    constructor(uint256 roundDurationBlocks_) {
        require(roundDurationBlocks_ > 0, "bad duration");
        roundDurationBlocks = roundDurationBlocks_;
        _startRound(1);
    }

    function current()
        external
        view
        returns (
            uint256 roundId_,
            address highestBidder_,
            uint256 highestBid_,
            uint256 endBlock_,
            string memory headline_,
            string memory link_,
            address pendingWinner_,
            bool adSetForRound_,
            uint256 roundDurationBlocks_
        )
    {
        return (
            roundId,
            highestBidder,
            highestBid,
            endBlock,
            headline,
            link,
            pendingWinner,
            adSetForRound,
            roundDurationBlocks
        );
    }

    /// @notice Place a bid. Must strictly beat the current highest bid. Previous leader is refunded.
    function bid() external payable {
        if (block.number > endBlock) revert RoundAlreadyEnded();
        if (msg.value <= highestBid) revert BidTooLow();

        address prev = highestBidder;
        uint256 prevBid = highestBid;

        highestBidder = msg.sender;
        highestBid = msg.value;

        if (prev != address(0) && prevBid > 0) {
            (bool ok,) = prev.call{value: prevBid}("");
            if (!ok) revert TransferFailed();
        }

        emit Bid(roundId, msg.sender, msg.value);
    }

    /// @notice End the round after endBlock. Winner may setAd; next round opens immediately.
    function settle() external {
        if (block.number <= endBlock) revert RoundNotEnded();

        address winner = highestBidder;
        uint256 amount = highestBid;
        uint256 settledRound = roundId;

        pendingWinner = winner;
        adSetForRound = false;

        emit Settled(settledRound, winner, amount);
        _startRound(settledRound + 1);
    }

    /// @notice Winner of the last settled round sets the billboard creative once.
    function setAd(string calldata headline_, string calldata link_) external {
        if (msg.sender != pendingWinner) revert NotPendingWinner();
        if (adSetForRound) revert AdAlreadySet();
        if (bytes(headline_).length == 0) revert EmptyHeadline();

        headline = headline_;
        link = link_;
        adSetForRound = true;

        // Ad belongs to the round that was just settled (roundId already advanced).
        emit AdSet(roundId - 1, msg.sender, headline_, link_);
    }

    function _startRound(uint256 newRoundId) internal {
        roundId = newRoundId;
        highestBid = 0;
        highestBidder = address(0);
        endBlock = block.number + roundDurationBlocks;
        emit RoundStarted(roundId, endBlock);
    }
}
