/*
 *  Copyright (c) 2018-present, Facebook, Inc.
 *
 *  This source code is licensed under the MIT license found in the LICENSE
 *  file in the root directory of this source tree.
 *
 */

#pragma once

#include <Flipper/FlipperConnectionManager.h>

namespace facebook {
namespace flipper {
namespace test {

class FlipperConnectionManagerMock : public FlipperConnectionManager {
 public:
  FlipperConnectionManagerMock() : callbacks(nullptr) {}

  void start() override {
    open = true;
    if (callbacks) {
      callbacks->onConnected();
    }
  }

  void stop() override {
    open = false;
    if (callbacks) {
      callbacks->onDisconnected();
    }
  }

  bool isOpen() const override {
    return open;
  }

  void sendMessage(const folly::dynamic& message) override {
    messages.push_back(message);
  }

  void setCallbacks(Callbacks* aCallbacks) override {
    callbacks = aCallbacks;
  }

 public:
  bool open = false;
  Callbacks* callbacks;
  std::vector<folly::dynamic> messages;
};

} // namespace test
} // namespace flipper
} // namespace facebook
