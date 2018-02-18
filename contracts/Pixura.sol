pragma solidity ^0.4.18;

import '../node_modules/zeppelin-solidity/contracts/token/ERC721/ERC721Token.sol';
import '../node_modules/zeppelin-solidity/contracts/ownership/Ownable.sol';
import '../node_modules/zeppelin-solidity/contracts/math/SafeMath.sol';

contract Pixura is ERC721Token,Ownable {

  // Mapping from token ID to the instagram ID
  mapping(uint256 => string) private tokenInstagramId;

  // Mapping from instragram ID to the token ID
  mapping(string => uint) private instagramIdToken;

  // Mapping from token ID to the address bidding
  mapping(uint256 => address) private tokenBidder;

  // Mapping from token ID to the current bid amount
  mapping(uint256 => uint) private tokenCurrentBid;

  // Mapping from token ID to the creator's address
  mapping(uint256 => address) private tokenCreator;


  event Bid(address indexed _bidder, uint256 indexed _bidAmount, uint256 indexed _bidTokenId);
  event AcceptBid(uint256 indexed _acceptedBidAmount, uint256 indexed _acceptedTokenId, address indexed _acceptedBidder);

  /**
   * @dev Guarantees _instagramId has not been used with a token already
   * @param _instagramId string ID of the instagram ID associated with the token
   */
  modifier uniqueInstagramId(string _instagramId) {
    require(instagramIdToken[_instagramId] == 0);
    _;

  }

  /**
   * @dev Adds a new unique token to the supply
   * @param _instagramId string Instagram ID associated with the token
   */
  function addNewToken(string _instagramId) public uniqueInstagramId(_instagramId) {
    uint256 newId = totalSupply() + 1;
    _mint(msg.sender,newId);
    tokenInstagramId[newId] = _instagramId;
    tokenCreator[newId] = msg.sender;
    instagramIdToken[_instagramId] = newId;

  }

  /**
   * @dev Gets the instagram ID of the specified token ID
   * @param _tokenId uint256 ID of the token to query the instragram ID
   * @return instagram ID currently marked for the given token ID
   */
  function instagramIdOfToken(uint256 _tokenId) public view returns (string) {
    return tokenInstagramId[_tokenId];

  }

  /**
   * @dev Gets the token ID of the specified token instragram ID
   * @param _instagramId string ID of the instagram to query the token ID
   * @return token ID currently marked for the given instragram ID
   */
  function tokenOfInstagramId(string _instagramId) public view returns (uint256) {
    return instagramIdToken[_instagramId];

  }

  /**
   * @dev Gets the current bid and bidder of the token
   * @param _tokenId uint256 ID of the token to get bid details
   * @return bid amount and bidder address of token
   */
  function currentBidDetailsOfToken(uint256 _tokenId) public view returns (uint256,address) {
    return (tokenCurrentBid[_tokenId],tokenBidder[_tokenId]);

  }

  /**
   * @dev Gets the creator of the token
   * @param _tokenId uint256 ID of the token
   * @return address of the creator
   */
  function creatorOfToken(uint256 _tokenId) public view returns (address) {
    return (tokenCreator[_tokenId]);

  }

  /**
   * @dev Bids on the token, replacing the bid if the bid is higher than the current bid. You cannot bid on a token you already own.
   * @param _tokenId uint256 ID of the token to bid on
   */
  function bid(uint256 _tokenId) public payable {
    address owner = ownerOf(_tokenId);
    require(msg.sender != owner);
    checkBidAndReturnCurrentBid(_tokenId);
    tokenBidder[_tokenId] = msg.sender;
    tokenCurrentBid[_tokenId] = msg.value;
    Bid(msg.sender, msg.value, _tokenId);

  }

  /**
   * @dev Accept the bid on the token, transferring ownership to the current bidder and paying out the owner.
   * @param _tokenId uint256 ID of the token with the standing bid
   */
  function acceptBid(uint256 _tokenId) public onlyOwnerOf(_tokenId) {
    uint256 currentBid = tokenCurrentBid[_tokenId];
    address currentBidder = tokenBidder[_tokenId];
    address tokenOwner = ownerOf(_tokenId);
    address creator = tokenCreator[_tokenId];
    payoutAcceptedBid(currentBid, owner, creator, tokenOwner);
    clearApprovalAndTransfer(msg.sender, currentBidder, _tokenId);
    clearBid(_tokenId);
    AcceptBid(currentBid, _tokenId, currentBidder);

  }

  /**
   * @dev Internal function to check that the bid is larger than current bid and returns funds to current bidder.
   * @param _tokenId uint256 ID of the token with the standing bid
   */
  function checkBidAndReturnCurrentBid(uint256 _tokenId) private {
    uint256 currentBid = tokenCurrentBid[_tokenId];
    address currentBidder = tokenBidder[_tokenId];
    require(msg.value > currentBid);
    if(currentBidder != address(0)) {
      currentBidder.transfer(currentBid);

    }

  }

  /**
   * @dev Internal function to clear bid
   * @param _tokenId uint256 ID of the token with the standing bid
   */
  function clearBid(uint256 _tokenId) private {
    tokenBidder[_tokenId] = address(0);
    tokenCurrentBid[_tokenId] = 0;

  }

  /**
   * @dev Internal function to pay the bidder, creator, and maintainer
   * @param _val uint256 value to be split
   * @param _maintainer address of account maintaining PIXURA
   * @param _creator address of the creator of token
   * @param _owner address of the owner of token
   */
  function payoutAcceptedBid(uint256 _val, address _maintainer, address _creator, address _owner) private {
    uint256 maintainerPayment = _val.mul(3).div(100);
    uint256 creatorPayment = _val.mul(10).div(100);
    uint256 ownerPayment = _val.sub(creatorPayment).sub(maintainerPayment);
    _maintainer.transfer(creatorPayment);
    _creator.transfer(creatorPayment);
    _owner.transfer(ownerPayment);

  }


}
