const SupeRare = artifacts.require("SupeRare");

//////////////////////////////////////////////////////////////////////////////
//// Helper Functions
//////////////////////////////////////////////////////////////////////////////

function getTokenIdFromTransfer(logs) {
  const tokenIds = logs
          .filter((l) => { return l.event === 'Transfer'; })
          .map((l) => { return l.args._tokenId; });
  assert(tokenIds.length === 1, 'only one transfer event should occur');
  return tokenIds[0];
}

async function createTokenReturnId(uri, acc) {
  let instance = await SupeRare.deployed();
  const res = await instance.addNewToken(uri, {from:acc});
  return getTokenIdFromTransfer(res.logs);
}

async function calculateGasCosts(hash) {
  const receipt = await web3.eth.getTransactionReceipt(hash),
        tx = await web3.eth.getTransaction(hash),
        gasUsed = receipt.gasUsed,
        gasPrice = tx.gasPrice;
  return gasPrice * gasUsed;

}

//////////////////////////////////////////////////////////////////////////////
//// SupeRare Tests
//////////////////////////////////////////////////////////////////////////////

contract('SupeRare test', async (accounts) => {

  before( async () => {
    let instance = await SupeRare.deployed();
    const superareOwner = accounts[0];
    [0,1,2,3].map(async i => {
      const creator = accounts[i];
      await instance.whitelistCreator(creator, {from:superareOwner});
    });
  });

  it('should create new token', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          superareOwner = accounts[0];
    await instance.whitelistCreator(creator, {from:superareOwner});
    const tokenId = await createTokenReturnId('uri', creator),
          tokenOwner =  await instance.ownerOf.call(tokenId),
          tokenCreator =  await instance.creatorOfToken.call(tokenId);
    assert.equal(tokenOwner, creator, 'token owner not creator');
    assert.equal(tokenCreator, creator, 'token creator not creator');
  });

  it('should not create new token if not a creator', async () => {
    let creator = accounts[4];
    let failed = false;
    try {
      await createTokenReturnId('fail_creator', creator);
    } catch(e) {
      failed = true;
    }
    assert(failed, 'should have failed to create token');
  });

  it('should not create new token with existing uri', async () => {
    let creator = accounts[0];
    await createTokenReturnId('fail_uri', creator);
    let failed = false;
    try {
      await createTokenReturnId('fail_uri', creator);
    } catch(e) {
      failed = true;
    }
    assert(failed, 'should have failed to create token');
  });

  it('should create new token and 3 editions and setting the sale price', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          editions = 3,
          salePrice = web3.toWei(3,'ether'),
          uri = 'uri-editions',
          res = await instance.addNewTokenWithEditions(
            uri,
            editions,
            salePrice,
            {from: creator}
          ),
          transferEvent = (l => { return l.event === 'Transfer';}),
          ids = res.logs.filter(transferEvent).map((l) => {
            return l.args._tokenId;
          });
    assert.equal(
      ids.length,
      (1 + editions),
      'incorrect number of tokens created'
    );
    {
      const tokenId = ids[0],
            tokenOwner =  await instance.ownerOf.call(tokenId),
            tokenCreator =  await instance.creatorOfToken.call(tokenId),
            originalTokenId =  await instance.originalTokenOfUri.call(uri);
      assert.equal(tokenOwner, creator, 'original token owner not creator');
      assert.equal(
        tokenCreator,
        creator,
        'original token creator not creator'
      );
      assert.equal(
        originalTokenId.toNumber(),
        tokenId.toNumber(),
        'original token id not expectef id'
      );
    }

    for(var i=1; i<ids.length; i++){
      const tokenId = ids[i],
            tokenOwner =  await instance.ownerOf.call(tokenId),
            tokenCreator =  await instance.creatorOfToken.call(tokenId);
      assert.equal(tokenOwner, creator, 'token owner not creator');
      assert.equal(tokenCreator, creator, 'token creator not creator');
    }
  });

  it('should create new token not for sale and 3 editions for sale ', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          editions = 3,
          salePrice = web3.toWei(3,'ether'),
          uri = 'uri-editions-sale-price',
          res = await instance.addNewTokenWithEditions(
            uri,
            editions,
            salePrice,
            {from: creator}
          ),
          transferEvent = (l => { return l.event === 'Transfer';}),
          ids = res.logs.filter(transferEvent).map((l) => {
            return l.args._tokenId;
          });
    {
      const tokenId = ids[0],
            currentSalePrice =
              await instance.salePriceOfToken.call(tokenId);
      assert.equal(
        currentSalePrice.toNumber(),
        0,
        'original set as for sale.'
      );
    }

    for(var i=1; i<ids.length; i++){
      const tokenId = ids[i],
            currentSalePrice =
              await instance.salePriceOfToken.call(tokenId);
      assert.equal(
        currentSalePrice.toNumber(),
        salePrice,
        'original set as for sale.'
      );
    }
  });

  it('should not create new token with editions if not a creator', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[4],
          editions = 3,
          uri = 'uri_editions_fail';
    let failed = false;
    try {
      await instance.addNewTokenWithEditions(
        uri,
        editions,
        {from: creator}
      );
    } catch(e) {
      failed = true;
    }
    assert(failed, 'should have failed to create token and creations');
  });

  it('should create a bid on a token', async () => {
    const creator = accounts[0],
          bidder = accounts[1],
          bidVal = web3.toWei(1,'ether'),
          instance = await SupeRare.deployed(),
          tokenId = await createTokenReturnId('test_bid', creator);
    await instance.bid(tokenId, {from: bidder, value: bidVal});
    const bidDetails = await instance.currentBidDetailsOfToken.call(tokenId),
          tokenBidder = bidDetails[1],
          tokenBid = bidDetails[0];
    assert.equal(tokenBidder, bidder, 'bidder not equal to token bidder');
    assert.equal(tokenBid, bidVal, 'bid not equal to token bid');
  });

  it('should create a bid on a token and balance be reflected in bidder\'s account', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          bidder = accounts[2],
          balancePrior = await web3.eth.getBalance(bidder),
          bidVal = web3.toWei(1,'ether'),
          tokenId = await createTokenReturnId('test_bid_with_acc', creator),
          res = await instance.bid(tokenId, {
            from: bidder,
            value: bidVal
          }),
          txHash = res.tx,
          gasCosts = await calculateGasCosts(txHash),
          expectedBalance = balancePrior.minus(gasCosts).minus(bidVal),
          currentBalance = await web3.eth.getBalance(bidder);
    assert.equal(
      currentBalance.toString(),
      expectedBalance.toString(),
      'bidder\'s balance not appropriately updated'
    );
  });

  it('should not bid on token if token owner', async () => {
    let creator = accounts[1],
        bidder = accounts[2],
        instance = await SupeRare.deployed();
    const tokenId = await createTokenReturnId('test_bid_fail_owner', creator);
    await instance.bid(tokenId, {from: bidder, value:web3.toWei(2,'ether')});
    let failed = false;
    try {
      await instance.bid(tokenId, {from: bidder, value:web3.toWei(2,'ether')});
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'should have failed to bid');
  });

  it('should not bid on token if token has bid greater than proposed bid', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          bidder = accounts[2],
          notBidder = accounts[3],
          tokenId = await createTokenReturnId('test_bid_fail_greater_bid', creator);
    await instance.bid(tokenId, {from: bidder, value:web3.toWei(2,'ether')});
    let failed = false;
    try {
      await instance.bid(tokenId, {from: notBidder, value:web3.toWei(1,'ether')});
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'should have failed to bid');
  });

  it('should accept a bid on a token', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          bidder = accounts[2],
          tokenId = await createTokenReturnId('test_accept_bid', creator);
    await instance.bid(tokenId, {from: bidder, value:web3.toWei(1,'ether')});
    await instance.acceptBid(tokenId, {from: creator});
    const tokenOwner =  await instance.ownerOf.call(tokenId),
          tokenCreator =  await instance.creatorOfToken.call(tokenId);
    assert.equal(tokenOwner, bidder, 'token ownership not transferred to bidder');
    assert.equal(tokenCreator, creator, 'token creator changed when shouldn\'t be');
  });

  it('should not accept bid if not token owner', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          bidder = accounts[2],
          tokenId = await createTokenReturnId('test_accept_bid_fail_owner', creator);
    await instance.bid(tokenId, {from: bidder, value:web3.toWei(2,'ether')});
    let failed = false;
    try {
      await instance.acceptBid(tokenId, {from: bidder});
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'should have failed to accept bid');
  });

  it('should accept bid and pay out to creator', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          bidder = accounts[2],
          bidVal = web3.toWei(1,'ether'),
          tokenId = await createTokenReturnId('test_accept_bid_payout_creator', creator);
    await instance.bid(tokenId, {from: bidder, value: bidVal});
    const balancePrior = await web3.eth.getBalance(creator),
          res = await instance.acceptBid(tokenId, {from: creator}),
          txHash = res.tx,
          gasCosts = await calculateGasCosts(txHash),
          expectedBalance = balancePrior.plus(bidVal).minus(gasCosts),
          currentBalance = await web3.eth.getBalance(creator);
    assert.equal(expectedBalance.toString(), currentBalance.toString());
  });

  it('should accept bid and pay out to creator, owner, and maintainer', async () => {
    let instance = await SupeRare.deployed();
    const maintainer = await instance.owner.call(),
          creator = accounts[1],
          tokenOwner = accounts[2],
          bidder = accounts[3],
          bidVal = web3.toBigNumber(web3.toWei(1,'ether')).toNumber(), 
          tokenId = await createTokenReturnId(
            'test_accept_bid_payout_everyone',
            creator
          );
    await instance.bid(tokenId, {from: tokenOwner, value: bidVal});
    await instance.acceptBid(tokenId, {from: creator});
    await instance.bid(tokenId, {from: bidder , value: bidVal});

    const maintainerBalancePrior = (await web3.eth.getBalance(maintainer)).toNumber(),
          creatorBalancePrior = (await web3.eth.getBalance(creator)).toNumber(),
          tokenOwnerBalancePrior = (await web3.eth.getBalance(tokenOwner)).toNumber(),

          maintainerPercentage = (await instance.maintainerPercentage.call()).toNumber(),
          creatorPercentage = (await instance.creatorPercentage.call()).toNumber(),

          expectedSentToMaintainer = bidVal *  maintainerPercentage / 1000,
          expectedSentToCreator = bidVal * creatorPercentage / 1000,
          expectedSentToTokenOwner =
            bidVal - expectedSentToMaintainer - expectedSentToCreator,

          res = await instance.acceptBid(tokenId, {from: tokenOwner}),
          txHash = res.tx,
          gasCosts = await calculateGasCosts(txHash),

          maintainerBalanceExpected = maintainerBalancePrior + expectedSentToMaintainer,
          creatorBalanceExpected = creatorBalancePrior + expectedSentToCreator,
          tokenOwnerBalanceExpected = tokenOwnerBalancePrior + expectedSentToTokenOwner - gasCosts,

          maintainerBalanceCurrent = (await web3.eth.getBalance(maintainer)).toNumber(),
          creatorBalanceCurrent = (await web3.eth.getBalance(creator)).toNumber(),
          tokenOwnerBalanceCurrent = (await web3.eth.getBalance(tokenOwner)).toNumber();
    assert.equal(
      maintainerBalanceExpected.toString(),
      maintainerBalanceCurrent.toString(),
      'maintainer was not paid expected amount'
    );
    assert.equal(
      creatorBalanceExpected.toString(),
      creatorBalanceCurrent.toString(),
      'creator was not paid expected amount'
    );
    assert.equal(
      tokenOwnerBalanceExpected.toString(),
      tokenOwnerBalanceCurrent.toString(),
      'tokenOwner was not paid expected amount'
    );
  });

  it('should cancel a bid on a token', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          bidder = accounts[2],
          bidVal = web3.toWei(1,'ether'),
          tokenId = await createTokenReturnId('test_cancel_bid', creator);
    await instance.bid(tokenId, {from: bidder, value: bidVal});
    await instance.cancelBid(tokenId, {from: bidder});
    const bidDetails = await instance.currentBidDetailsOfToken.call(tokenId),
          tokenBidder = bidDetails[1],
          tokenBid = bidDetails[0];
    assert.notEqual(tokenBidder, bidder, 'bidder should not be equal to token bidder');
    assert.notEqual(tokenBid, bidVal, 'bid should not equal to token bid');
  });

  it('should not cancel bid if not current bidder', async () => { 
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          bidder = accounts[2],
          notBidder = accounts[3],
          tokenId = await createTokenReturnId('test_cancel_bid_fail', creator);
    await instance.bid(tokenId, {from: bidder, value:web3.toWei(2,'ether')});
    let failed = false;
    try {
      await instance.acceptBid(tokenId, {from: notBidder});
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'should have failed to cancel bid');
  });

  it('should set sale price on token', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          expectedSalePrice = web3.toWei(3,'ether'),
          tokenId = await createTokenReturnId('test_sale_price', creator);
    await instance.setSalePrice(tokenId, expectedSalePrice, {from: creator});
    const salePrice = await instance.salePriceOfToken.call(tokenId);
    assert.equal(expectedSalePrice, salePrice, 'sale price not set');
  });

  it('should set sale price on token with current bid', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          bidder = accounts[2],
          expectedSalePrice = web3.toWei(3,'ether'),
          bidPrice = web3.toWei(2,'ether'),
          tokenId = await createTokenReturnId('test_sale_price_with_bid', creator);
    await instance.bid(tokenId, {from: bidder, value: bidPrice});
    await instance.setSalePrice(tokenId, expectedSalePrice, {from: creator});
    const salePrice = await instance.salePriceOfToken.call(tokenId);
    assert.equal(expectedSalePrice, salePrice, 'sale price not set');
  });

  it('should not set sale price if not token owner', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          notOwner = accounts[2],
          expectedSalePrice = web3.toWei(3,'ether'),
          tokenId = await createTokenReturnId(
            'test_sale_price_fail_not_owner',
            creator
          );
    let failed = false;
    try {
      await instance.setSalePrice(tokenId, expectedSalePrice, {from: notOwner});
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'should have failed to set sale price');
  });

  it('should not set sale price if greater bid exists', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          bidder = accounts[2],
          bidVal = web3.toWei(2,'ether'),
          failedSalePrice = web3.toWei(1,'ether'),
          tokenId = await createTokenReturnId(
            'test_sale_price_greater_bid',
            creator
          );
    await instance.bid(tokenId, {from: bidder, value: bidVal});
    let failed = false;
    try {
      await instance.setSalePrice(tokenId, failedSalePrice, {from: creator});
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'should have failed to set sale price');
  });

  it('should buy token', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          buyer = accounts[2],
          salePrice = web3.toWei(3,'ether'),
          tokenId = await createTokenReturnId('test_buy', creator);
    await instance.setSalePrice(tokenId, salePrice, {from: creator});
    await instance.buy(tokenId, {from: buyer, value: salePrice});
    const tokenOwner =  await instance.ownerOf.call(tokenId),
          tokenCreator =  await instance.creatorOfToken.call(tokenId);
    assert.equal(tokenOwner, buyer, 'token ownership not transferred to buyer');
    assert.equal(tokenCreator, creator, 'token creator changed when shouldn\'t be');
  });

  it('should not buy a token if the owner', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          salePrice = web3.toWei(3,'ether'),
          tokenId = await createTokenReturnId(
            'test_buy_fail_if_owner',
            creator
          );
    await instance.setSalePrice(tokenId, salePrice, {from: creator});
    let failed = false;
    try {
      await instance.buy(tokenId, {from: creator, value: salePrice});
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'should have failed to buy');
  });

  it('should not buy a token if not for sale', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          buyer = accounts[2],
          salePrice = web3.toWei(3,'ether'),
          tokenId = await createTokenReturnId(
            'test_buy_fail_if_not_for_sale',
            creator
          );
    let failed = false;
    try {
      await instance.buy(tokenId, {from: buyer, value: salePrice});
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'should have failed to buy');
  });

  it('should not buy a token if not enough money sent', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          buyer = accounts[2],
          salePrice = web3.toWei(2,'ether'),
          failSalePrice = web3.toWei(1,'ether'),
          tokenId = await createTokenReturnId(
            'test_buy_fail_if_money_not_enough',
            creator
          );
    await instance.setSalePrice(tokenId, salePrice, {from: creator});
    let failed = false;
    try {
      await instance.buy(tokenId, {from: buyer, value: failSalePrice});
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'should have failed to buy');
  });

  it('should buy a token and current bidder gets money returned', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          buyer = accounts[2],
          bidder = accounts[3],
          salePrice = web3.toWei(3,'ether'),
          bidPrice = web3.toWei(2,'ether'),
          tokenId = await createTokenReturnId('test_buy_return_bidder_money', creator);
    await instance.bid(tokenId, {from: bidder, value: bidPrice});
    await instance.setSalePrice(tokenId, salePrice, {from: creator});
    const priorBidderBalance = await web3.eth.getBalance(bidder);
    await instance.buy(tokenId, {from: buyer, value: salePrice});
    const expectedBidderBalance = priorBidderBalance.plus(bidPrice),
          currentBidderBalance = await web3.eth.getBalance(bidder);
    assert.equal(
      expectedBidderBalance.toString(),
      currentBidderBalance.toString(),
      'bidder balance not accurate'
    );
  });

  it('should buy a token and pay out creator as first sale', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          buyer = accounts[3],
          salePrice = web3.toWei(1,'ether'),
          tokenId = await createTokenReturnId('test_buy_payout_creator', creator);
    await instance.setSalePrice(tokenId, salePrice, {from: creator});
    const priorBuyerBalance = await web3.eth.getBalance(buyer),
          priorCreatorBalance = await web3.eth.getBalance(creator),

          res = await instance.buy(tokenId, {from: buyer, value: salePrice}),
          txHash = res.tx,
          gasCosts = await calculateGasCosts(txHash),

          expectedBuyerBalance = priorBuyerBalance.minus(salePrice).minus(gasCosts),
          expectedCreatorBalance = priorCreatorBalance.plus(salePrice),
          currentBuyerBalance = await web3.eth.getBalance(buyer),
          currentCreatorBalance = await web3.eth.getBalance(creator);
    assert.equal(
      expectedBuyerBalance.toString(),
      currentBuyerBalance.toString(),
      'buyer balance not accurate'
    );
    assert.equal(
      expectedCreatorBalance.toString(),
      currentCreatorBalance.toString(),
      'creator balance not accurate'
    );
  });

  it('should buy a token and pay out appropriate distributions', async () => {
    let instance = await SupeRare.deployed();
    const maintainer = await instance.owner.call(),
          creator = accounts[1],
          tokenOwner = accounts[2],
          buyer = accounts[3],
          bidVal = web3.toBigNumber(web3.toWei(1,'ether')).toNumber(), 
          salePrice = web3.toBigNumber(web3.toWei(2,'ether')).toNumber(), 
          tokenId = await createTokenReturnId(
            'test_buy_payout_everyone',
            creator
          );
    await instance.bid(tokenId, {from: tokenOwner, value: bidVal});
    await instance.acceptBid(tokenId, {from: creator});
    await instance.setSalePrice(tokenId, salePrice, {from: tokenOwner});

    const maintainerBalancePrior = (await web3.eth.getBalance(maintainer)).toNumber(),
          creatorBalancePrior = (await web3.eth.getBalance(creator)).toNumber(),
          tokenOwnerBalancePrior = (await web3.eth.getBalance(tokenOwner)).toNumber(),
          buyerBalancePrior = (await web3.eth.getBalance(buyer)).toNumber(),

          maintainerPercentage = (await instance.maintainerPercentage.call()).toNumber(),
          creatorPercentage = (await instance.creatorPercentage.call()).toNumber(),

          expectedSentToMaintainer = salePrice *  maintainerPercentage / 1000,
          expectedSentToCreator = salePrice * creatorPercentage / 1000,
          expectedSentToTokenOwner =
            salePrice - expectedSentToMaintainer - expectedSentToCreator,

          res = await instance.buy(tokenId, {from: buyer, value: salePrice}),
          txHash = res.tx,
          gasCosts = await calculateGasCosts(txHash),

          maintainerBalanceExpected = maintainerBalancePrior + expectedSentToMaintainer,
          creatorBalanceExpected = creatorBalancePrior + expectedSentToCreator,
          tokenOwnerBalanceExpected = tokenOwnerBalancePrior + expectedSentToTokenOwner,
          buyerBalanceExpected = buyerBalancePrior - salePrice - gasCosts,

          maintainerBalanceCurrent = (await web3.eth.getBalance(maintainer)).toNumber(),
          creatorBalanceCurrent = (await web3.eth.getBalance(creator)).toNumber(),
          tokenOwnerBalanceCurrent = (await web3.eth.getBalance(tokenOwner)).toNumber(),
          buyerBalanceCurrent = (await web3.eth.getBalance(buyer)).toNumber();
    assert.equal(
      maintainerBalanceExpected.toString(),
      maintainerBalanceCurrent.toString(),
      'maintainer was not paid expected amount'
    );
    assert.equal(
      creatorBalanceExpected.toString(),
      creatorBalanceCurrent.toString(),
      'creator was not paid expected amount'
    );
    assert.equal(
      tokenOwnerBalanceExpected.toString(),
      tokenOwnerBalanceCurrent.toString(),
      'tokenOwner was not paid expected amount'
    );
    assert.equal(
      buyerBalanceExpected.toString(),
      buyerBalanceCurrent.toString(),
      'buyer did not lose expected amount'
    );
  });

  it('should transfer token and pay out appropriately, no longer first sale', async () => {
    let instance = await SupeRare.deployed();
    const maintainer = await instance.owner.call(),
          creator = accounts[1],
          tokenOwner = accounts[2],
          bidder = accounts[3],
          bidVal = web3.toBigNumber(web3.toWei(1,'ether')).toNumber(), 
          tokenId = await createTokenReturnId(
            'test_transfer_accept_bid_payout_everyone',
            creator
          );
    await instance.transfer(tokenOwner, tokenId, {from: creator});
    await instance.bid(tokenId, {from: bidder , value: bidVal});

    const maintainerBalancePrior =
            (await web3.eth.getBalance(maintainer)).toNumber(),
          creatorBalancePrior =
            (await web3.eth.getBalance(creator)).toNumber(),
          tokenOwnerBalancePrior =
            (await web3.eth.getBalance(tokenOwner)).toNumber(),

          maintainerPercentage =
            (await instance.maintainerPercentage.call()).toNumber(),
          creatorPercentage = (await instance.creatorPercentage.call()).toNumber(),

          expectedSentToMaintainer = bidVal *  maintainerPercentage / 1000,
          expectedSentToCreator = bidVal * creatorPercentage / 1000,
          expectedSentToTokenOwner =
            bidVal - expectedSentToMaintainer - expectedSentToCreator,

          res = await instance.acceptBid(tokenId, {from: tokenOwner}),
          txHash = res.tx,
          gasCosts = await calculateGasCosts(txHash),

          maintainerBalanceExpected =
            maintainerBalancePrior + expectedSentToMaintainer,
          creatorBalanceExpected = creatorBalancePrior + expectedSentToCreator,
          tokenOwnerBalanceExpected =
            tokenOwnerBalancePrior + expectedSentToTokenOwner - gasCosts,

          maintainerBalanceCurrent =
            (await web3.eth.getBalance(maintainer)).toNumber(),
          creatorBalanceCurrent =
            (await web3.eth.getBalance(creator)).toNumber(),
          tokenOwnerBalanceCurrent =
            (await web3.eth.getBalance(tokenOwner)).toNumber();
    assert.equal(
      maintainerBalanceCurrent.toString(),
      maintainerBalanceExpected.toString(),
      'maintainer was not paid expected amount'
    );
    assert.equal(
      creatorBalanceCurrent.toString(),
      creatorBalanceExpected.toString(),
      'creator was not paid expected amount'
    );
    assert.equal(
      tokenOwnerBalanceCurrent.toString(),
      tokenOwnerBalanceExpected.toString(),
      'tokenOwner was not paid expected amount'
    );
  });

  it('should add a creator to the whitelist', async () => {
    let instance = await SupeRare.deployed();
    const superareOwner = await instance.owner.call(),
          creatorToAdd = accounts[5];
    await instance.whitelistCreator(
      creatorToAdd,
      {from: superareOwner}
    );
    const isWhitelisted = await instance.isWhitelisted.call(creatorToAdd);
    assert.equal(true, isWhitelisted, 'creator not added to whitelist');
  });

  it('should set maintainer percentage', async () => {
    let instance = await SupeRare.deployed();
    const superareOwner = await instance.owner.call(),
          newPercentage = 20;
    await instance.setMaintainerPercentage(
      newPercentage,
      {from: superareOwner}
    );
    const obtainedPercentage = await instance.maintainerPercentage.call();
    assert.equal(newPercentage, obtainedPercentage, 'newPercentage not set');
  });

  it('should not add creators to whitelist if not superare owner', async () => {
    let instance = await SupeRare.deployed();
    const notOwner = accounts[1],
          notCreator = accounts[2];
    let failed = false;
    try {
      await instance.setMaintainerPercentage(
        notCreator,
        {from: notOwner}
      );
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'cannot add creators if not owner');
  });

  it('should not set maintainer percentage if not superare owner', async () => {
    let instance = await SupeRare.deployed();
    const notOwner = accounts[1],
          newPercentage = 20;
    let failed = false;
    try {
      await instance.setMaintainerPercentage(
        newPercentage,
        {from: notOwner}
      );
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'cannot set maintainer percentage if not owner');
  });

  it('should set creator percentage', async () => {
    let instance = await SupeRare.deployed();
    const superareOwner = await instance.owner.call(),
          newPercentage = 20;
    await instance.setCreatorPercentage(
      newPercentage,
      {from: superareOwner}
    );
    const obtainedPercentage = await instance.creatorPercentage.call();
    assert.equal(newPercentage, obtainedPercentage, 'newPercentage not set');
  });

  it('should not set creator percentage if not superare owner', async () => {
    let instance = await SupeRare.deployed();
    const notOwner = accounts[1],
          newPercentage = 20;
    let failed = false;
    try {
      await instance.setCreatorPercentage(
        newPercentage,
        {from: notOwner}
      );
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'cannot set creator percentage if not owner');
  });

  it('should not approve', async () => {
    let instance = await SupeRare.deployed();
    const creator = accounts[1],
          tokenId = await createTokenReturnId(
            'test_not_approve',
            creator
          );
    let failed = false;
    try {
      await instance.approve(tokenId, {from: creator});
    } catch(e)  {
      failed = true;
    }
    assert(failed, 'no one can approve');
  });

})
