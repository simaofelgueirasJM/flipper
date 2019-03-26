/*
 *  Copyright (c) 2018-present, Facebook, Inc.
 *
 *  This source code is licensed under the MIT license found in the LICENSE
 *  file in the root directory of this source tree.
 *
 */
#if FB_SONARKIT_ENABLED

#import "SKIOSNetworkAdapter.h"
#import "FLEXNetworkObserver.h"
#import "FLEXNetworkRecorder.h"

@implementation SKIOSNetworkAdapter
@synthesize delegate = _delegate;
- (instancetype)init{
  if (self=[super init]){
    _delegate = nil;
  }
  return self;
}

- (void)setDelegate:(id<SKNetworkReporterDelegate>)delegate {
  _delegate = delegate;
  [FLEXNetworkObserver start];
  [FLEXNetworkRecorder defaultRecorder].delegate = _delegate;
}

@end

#endif
